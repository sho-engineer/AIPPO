"""POST /api/profile/

AI活用診断（3問）の回答を保存する。

なぜ要るか: これが無いと、実証実験で
**「どんな人が来て、どんな人が完走したか」が分からない**。
完了率だけ見ても、AIをまったく使ったことのない人が離脱しているのか、
ふだん使う人が物足りなくて離脱しているのかを区別できない。

学習者は匿名のまま。`learner_key` に紐づけるだけで、
氏名・連絡先の類は一切受け取らない（憲章 原則 VI）。

保存に失敗してもレッスンは止めない。診断は本題ではないので、
呼び出し側は結果を待たずに次へ進んでよい。
"""

import logging

from django.db import IntegrityError
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.profiles.models import LearnerProfile
from apps.profiles.serializers import LearnerProfileSerializer

logger = logging.getLogger(__name__)


class LearnerProfileView(APIView):
    def post(self, request: Request) -> Response:
        serializer = LearnerProfileSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST
            )

        learner_key = getattr(request, "learner_key", None)
        if learner_key is None:
            return Response(status=status.HTTP_204_NO_CONTENT)

        save_profile(learner_key, serializer.validated_data)
        return Response(status=status.HTTP_204_NO_CONTENT)


def save_profile(learner_key, values: dict) -> None:
    """診断の回答を保存する。何度やり直しても、最後の回答が残る。

    `update_or_create` は使わない。あれは1つのトランザクションの中で
    「読んでから書く」ので、書き込みが重なった瞬間に
    `database is locked` で 500 になる。読んだ時点では共有ロックしか
    持っておらず、書き込みへ昇格しようとしたところで別の接続と
    かち合うと、待ち時間の設定に関係なくその場で失敗するため
    （実行回数の記録も同じ理由で1文にしてある）。

    ここでは1文ずつに分ける。UPDATE も INSERT もそれ自体で完結するので、
    ぶつかっても設定どおりに待てる。
    """
    updated = LearnerProfile.objects.filter(learner_key=learner_key).update(**values)
    if updated:
        return

    try:
        LearnerProfile.objects.create(learner_key=learner_key, **values)
    except IntegrityError:
        # 同じ人の回答がほぼ同時に2つ来て、先に片方が入った。
        # 後から来たほうが新しい回答なので、上書きする。
        LearnerProfile.objects.filter(learner_key=learner_key).update(**values)
