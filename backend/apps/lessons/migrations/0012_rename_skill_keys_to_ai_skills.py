"""習得済みの記録を、AI技の slug へ付け替える。

いままで `SkillProgress.skill_key` に入っていたのは、レッスンに関係なく
必ず付く固定の4つだった（`state_audience` / `state_tone` /
`state_length` / `review_output`）。図鑑（AI技）を入れるにあたり、
名前を一般用語の slug へそろえる。

**消さずに付け替える。** 消して作り直すと、いままでに習得した分が
利用者から見て**無かったことになる**。名前だけを変えて、獲得の日付も
どのレッスンで取ったかも、そのまま残す。

新しい slug 側に既に行がある場合（何らかの理由で両方持っている人）は、
古いほうを消す。(learner_key, skill_key) は unique なので、
そのまま付け替えると落ちる。
"""

from __future__ import annotations

from django.db import migrations

#: 旧 skill_key → 新 slug。
#: 旧4つは「相手・雰囲気・長さ・出力の確認」だったので、そのまま対応が付く。
RENAMES = {
    "state_audience": "target",
    "state_tone": "tone",
    "state_length": "length",
    "review_output": "fact_check",
}


def rename_forward(apps, schema_editor):
    _rename(apps, RENAMES)


def rename_backward(apps, schema_editor):
    _rename(apps, {new: old for old, new in RENAMES.items()})


def _rename(apps, mapping: dict[str, str]) -> None:
    SkillProgress = apps.get_model("lessons", "SkillProgress")

    for source, target in mapping.items():
        rows = SkillProgress.objects.filter(skill_key=source)
        taken = set(
            SkillProgress.objects.filter(skill_key=target).values_list(
                "learner_key", flat=True
            )
        )
        for row in rows:
            if row.learner_key in taken:
                # 行き先が埋まっている。新しいほうを正とし、古いほうを消す
                row.delete()
                continue
            row.skill_key = target
            row.save(update_fields=["skill_key"])
            taken.add(row.learner_key)


class Migration(migrations.Migration):
    dependencies = [
        ("lessons", "0011_alter_learningevent_event_type"),
    ]

    operations = [
        migrations.RunPython(rename_forward, rename_backward),
    ]
