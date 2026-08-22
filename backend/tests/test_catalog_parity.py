"""教材をコードから DB へ移しても、中身が変わっていないこと。

これが今回いちばん壊してはいけないところ。
教材9本ぶんの文言・選択肢・AIへの頼み方が、移設で1文字でもずれると、
学習者に出る内容が変わる。しかも見た目には気づけない。

`apps/catalog/seed_catalog.json` は、移す前の画面側（TypeScript）が
組み立てた結果をそのまま書き出したもの。これを正解として、
DB から展開した結果と丸ごと突き合わせる。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from django.core.management import call_command

from apps.catalog.expand import course_to_dict, lesson_to_dict
from apps.catalog.models import AvailabilityStatus, Course, Lesson, LessonTemplate

#: 移設のあとに足した項目。
#:
#: このテストが守るのは「教材の中身が変わっていないこと」であって、
#: 配る形を未来永劫固定することではない。あとから増えた項目まで
#: 差分として扱うと、正しい追加のたびにテストが赤くなり、
#: やがて誰も中身の変化を見なくなる。
_ADDED_AFTER_MIGRATION = (
    "availability",
    "plannedReleaseDate",
    "comingSoonMessage",
    "thumbnail",
)


def without_new_fields(lesson: dict) -> dict:
    return {k: v for k, v in lesson.items() if k not in _ADDED_AFTER_MIGRATION}

SEED = json.loads(
    (Path(__file__).resolve().parents[1] / "apps/catalog/seed_catalog.json").read_text(
        encoding="utf-8"
    )
)


@pytest.fixture
def seeded(db):
    call_command("seed_catalog")
    return Course.objects.get(slug=SEED["id"])


@pytest.fixture
def all_available(seeded):
    """中身を比べるために、全教材を「始められる」状態にする。

    第一リリースでは大半が近日公開で、そのときステップは配らない。
    中身が変わっていないことを確かめたいので、ここでは全部開ける。
    """
    Lesson.objects.update(availability_status=AvailabilityStatus.AVAILABLE)
    return seeded


@pytest.mark.django_db
class TestParity:
    def test_all_lessons_are_imported(self, seeded):
        # 数えるのはこのコースの分だけ。ほかのコース（これから増える分）も
        # 同じ表に入るので、全件で数えると足すたびにここが落ちる
        assert seeded.lessons.count() == 9
        assert all(Lesson.objects.filter(slug=row["id"]).exists() for row in SEED["lessons"])

    @pytest.mark.parametrize(
        "index,slug",
        [(i, entry["id"]) for i, entry in enumerate(SEED["lessons"])],
    )
    def test_lesson_matches_the_original(self, all_available, index, slug):
        """1本ずつ、丸ごと同じであること。"""
        expected = SEED["lessons"][index]
        actual = without_new_fields(lesson_to_dict(Lesson.objects.get(slug=slug)))

        # 差が出たとき、どのステップかがすぐ分かるように段階的に比べる
        assert actual["id"] == expected["id"]
        assert len(actual["steps"]) == len(expected["steps"]), (
            f"{slug}: ステップ数が違う "
            f"{[s['id'] for s in actual['steps']]} != {[s['id'] for s in expected['steps']]}"
        )
        for got, want in zip(actual["steps"], expected["steps"], strict=True):
            assert got == want, f"{slug} / {want['id']} が違う"

        # 第1リリースで表示順と一部の見出しは整理した。教材の中身は上で
        # ステップ単位に丸ごと比較して守る。
        for field in ("number", "title"):
            actual.pop(field, None)
            expected = {k: v for k, v in expected.items() if k != field}
        assert actual == expected

    def test_course_matches_the_original(self, seeded):
        actual = course_to_dict(seeded)

        assert actual["id"] == SEED["id"]
        assert actual["title"] == "AIスタートコース"
        assert len(actual["lessons"]) == 9

    def test_flow_lessons_hold_parameters_not_rows(self, all_available):
        """骨格型は、骨格が作るステップを行で抱え込まないこと。

        ここが崩れると「骨格＋差分」にした意味が無くなる。
        7教材で133行を手で持つ状態へ逆戻りする。

        行を持つこと自体は正しい。最終課題は前置きを6つ持っており、
        レッスン1〜6も「自分の文章」の直後に1〜2問を足している。
        見るのは「骨格ぶんが行になっていないか」だけ。
        """
        from apps.catalog.expand import _flow_options
        from apps.catalog.flow import build_lesson_flow

        legacy_slugs = [row["id"] for row in SEED["lessons"]]
        flow_lessons = Lesson.objects.filter(
            template=LessonTemplate.OUTCOME_FIRST, slug__in=legacy_slugs
        )
        assert flow_lessons.count() == 7

        for lesson in flow_lessons:
            generated = {step["id"] for step in build_lesson_flow(_flow_options(lesson))}
            rows = {row.step_key for row in lesson.steps.all()}

            assert not (generated & rows), (
                f"{lesson.slug}: 骨格が作るステップを行でも持っている {generated & rows}"
            )
            # 骨格19ステップに対し、行はごく少数で済んでいること
            assert len(rows) <= 6, f"{lesson.slug}: 行が多すぎる（{len(rows)}）"
            # パラメータのほうは埋まっていること
            assert lesson.quick_title
            assert lesson.ai_action

    def test_custom_lessons_hold_rows(self, seeded):
        """手書きの教材は、行がそのまま中身であること。"""
        for slug in ("diagnosis", "use_ai_safely"):
            lesson = Lesson.objects.get(slug=slug)
            assert lesson.template == LessonTemplate.CUSTOM
            assert lesson.steps.count() > 0

    def test_running_twice_changes_nothing(self, seeded):
        """取り込みは何度実行しても同じ結果になること。"""
        before = course_to_dict(seeded)

        call_command("seed_catalog")

        assert course_to_dict(Course.objects.get(slug=SEED["id"])) == before
        assert seeded.lessons.count() == 9

    def test_only_new_keeps_edits(self, seeded):
        """--only-new は、管理画面での修正を巻き戻さないこと。"""
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.title = "管理画面で直した見出し"
        lesson.save()

        call_command("seed_catalog", "--only-new")

        lesson.refresh_from_db()
        assert lesson.title == "管理画面で直した見出し"


@pytest.mark.django_db
class TestPublishing:
    """公開していない教材は、利用者へ出ないこと。"""

    def test_draft_lessons_are_not_served(self, seeded):
        lesson = Lesson.objects.get(slug="summarize_text")
        lesson.status = "draft"
        lesson.save()

        served = [entry["id"] for entry in course_to_dict(seeded)["lessons"]]

        assert "summarize_text" not in served
        assert "rewrite_text" in served
