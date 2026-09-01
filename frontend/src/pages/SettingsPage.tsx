/**
 * 設定（支給デザイン）。
 *
 * 一覧から下位画面へ潜る作り。1画面には1つの目的だけを置く。
 * 全部を1枚に並べると、探すのに読み下すことになる。
 *
 * 保存は押した瞬間に効く。「保存」ボタンは置かない。
 * 押し忘れて戻ると、変えたはずの設定が消えている——それがいちばん困る。
 * 効いたことは画面の変化そのもので分かるようにしてある。
 *
 * まだ無いものは、載せない
 * ------------------------
 * AI設定・学習設定・言語設定・外部連携・サブスクリプション・ヘルプは、
 * 以前ここに押せない行として並べていた（「来る予定がある」と伝えるため）。
 * やめた。設定を開く人は予定を知りに来ていない。押せない行が半分を
 * 占める画面は、探しものの邪魔にしかならない。
 *
 * 消したのは**画面から**で、端末に残っている値は消していない。
 * 仕組みが用意できた日に、そのときの選択がそのまま効く。
 *
 * どこにも面を浮かせない
 * ----------------------
 * 行の束をカードに入れない。白い面が影を落として下地に浮き、それが
 * 縦に4つ5つ並ぶ画面は、手元のどのアプリの設定とも違う見え方になる。
 * 面は1枚だけ、画面の端まで伸ばす（components/settings/Controls.tsx）。
 *
 * アカウント設定は動く。登録なしでも教材は最後まで通るので、ここは
 * 「登録しないと始まらない入口」ではなく「残したくなったときの置き場」。
 * 取っておくもの（あとで見る印・プロンプト帳・修了証）だけが
 * この置き場の内側にある（src/course/keeping.ts）。
 */

import { useEffect, useState } from "react";

import { AppHeader, IconMark } from "../components/AppShell";
import { AuthDialog } from "../components/auth/AuthDialog";
import { AccountPanel } from "../components/settings/AccountPanel";
import { CreditPanel } from "../components/rewards/CreditPanel";
import { LegalMenu, LegalView } from "../components/legal/LegalView";
import {
  PRIVACY,
  findLegalDocument,
  type LegalDocument,
} from "../content/legal";
import {
  IconBell,
  IconBookmark,
  IconChat,
  IconClock,
  IconDocument,
  IconPerson,
  IconRefresh,
  IconShield,
  IconSound,
  IconSparkle,
} from "../components/Icons";
import {
  SettingsGroup,
  SettingsList,
  SettingsRow,
  Toggle,
} from "../components/settings/Controls";
import { updateReminders } from "../api/accounts";
import { previewSuccessSound } from "../course/sound";
import { useAuth } from "../auth/AuthContext";
import {
  clearLearningData,
  exportLearningData,
  loadSettings,
  resetSettings,
  saveSettings,
  type Settings,
} from "../lib/settings";
import { APP_VERSION } from "../content/ui";

/** 下位画面の名前。一覧は null。 */
type Panel =
  | "account"
  | "credit"
  | "notification"
  | "sound"
  | "privacy"
  | "legal"
  | null;

export interface SettingsPageProps {
  onBack: () => void;
  /**
   * 学習記録・あとで見るへ。
   *
   * どちらも下タブから外した（AI技とマイ成果物を入れるため）。
   * タブから消すのと、行き先ごと消すのは別のこと——ここに置いて、
   * 探せば必ず見つかる場所を1つ残す。
   */
  onOpenRecord: () => void;
  onOpenSaved: () => void;
}

export function SettingsPage({ onBack, onOpenRecord, onOpenSaved }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // 規約の下位画面。null なら3つの一覧
  const [legalId, setLegalId] = useState<LegalDocument["id"] | null>(null);

  /*
    変えたら、その場で端末に書く。
    まとめて保存にすると、押し忘れと「戻る」で必ず取りこぼす。
  */
  const update = (patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  };

  /*
    モデル一覧はもう聞かない。

    AI設定を止めたので、聞いても出す先が無い。設定画面を開くたびに
    サーバーへ1往復するだけになる。繋ぎ戻すときは
    `api/models.ts` の fetchModels をここで呼ぶ（消していない）。
  */

  // 知らせは数秒で消す。出しっぱなしにすると次の操作の邪魔になる
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const back = () => {
    // 規約の本文からは、まず一覧へ戻る。1段ずつ戻す
    if (legalId !== null) return setLegalId(null);
    if (panel !== null) return setPanel(null);
    onBack();
  };

  const title = {
    account: "アカウント設定",
    // 帳簿の言葉（Credit）ではなく、見に来た人が知りたいことの名前
    credit: "AI利用状況",
    notification: "通知",
    sound: "効果音",
    privacy: "学習データ・プライバシー",
    legal: "規約とポリシー",
  };

  return (
    <>
      <AppHeader onBack={back} centered />

      <main className="page">
        {/* 押した結果は、画面の上に短く出す。読み上げにも届ける */}
        {notice && (
          <p
            role="status"
            data-testid="settings-notice"
            className="mb-4 animate-fade-up rounded-card bg-brand-soft px-4 py-3
                       text-sm text-brand-dark"
          >
            {notice}
          </p>
        )}

        {panel === null ? (
          <MainMenu
            onOpenRecord={onOpenRecord}
            onOpenSaved={onOpenSaved}
            onOpen={setPanel}
          />
        ) : (
          /* key を付けて、画面が変わるたびに入りの動きをやり直す */
          <div key={panel} className="animate-slide-in">
            <h1 className="mt-2 text-xl font-bold sm:text-2xl">
              {panel === "legal" && legalId
                ? (findLegalDocument(legalId)?.title ?? title[panel])
                : title[panel]}
            </h1>

            {panel === "account" && (
              <AccountPanel
                onOpenAuth={() => setAuthOpen(true)}
                onNotice={setNotice}
              />
            )}
            {panel === "credit" && (
              <CreditPanel
                onOpenAuth={() => setAuthOpen(true)}
                onNotice={setNotice}
              />
            )}
            {panel === "legal" &&
              (legalId === null ? (
                <LegalMenu onOpen={setLegalId} />
              ) : (
                <LegalView document={findLegalDocument(legalId)!} />
              ))}
            {panel === "notification" && (
              <NotificationPanel settings={settings} onChange={update} />
            )}
            {panel === "sound" && (
              <SoundPanel settings={settings} onChange={update} />
            )}
            {panel === "privacy" && (
              <PrivacyPanel
                onNotice={setNotice}
                onResetSettings={() => {
                  resetSettings();
                  setSettings(loadSettings());
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* 登録・ログインはどの下位画面からでも同じ1枚を開く */}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onDone={setNotice}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ 一覧

/**
 * 設定の一覧。
 *
 * 「まだ無いもの」は載せない
 * --------------------------
 * 以前は AI設定・学習設定・言語設定・外部連携・サブスクリプション・
 * ヘルプの6行を、押せない形で並べていた。理由は「来る予定があると
 * 伝えるため」だったが、**設定を開く人は予定を知りに来ていない**。
 * 12行のうち半分が灰色で、押しても何も起きない画面は、探しものの
 * 邪魔にしかならない。使えるものだけを並べ、増えたらそのとき足す。
 *
 * 「開発中の機能を設定に出さない」は、この画面の決まりとする。
 * 通知の3つのつまみ（配信の仕組みがまだ無いもの）も同じ理由で外した。
 *
 * 3つに束ねる
 * -----------
 * 12行を1枚に流すと、どこに何があるかを毎回上から探すことになる。
 *
 *   学習          … 自分の記録
 *   アカウント    … 本人まわり
 *   アプリ        … この端末の振る舞い
 */
function MainMenu({
  onOpen,
  onOpenRecord,
  onOpenSaved,
}: {
  onOpen: (panel: Panel) => void;
  onOpenRecord: () => void;
  onOpenSaved: () => void;
}) {
  return (
    <div className="animate-fade-up">
      {/*
        「学習環境や表示をカスタマイズできます。」は書かない。
        設定画面を開いた人は、そこが設定だと知っている。
      */}
      <h1 className="mt-2 text-xl font-bold sm:text-2xl">設定</h1>

      {/*
        下タブから外した2つ。

        AI技とマイ成果物を入れるために外したが、行き先ごと消しては
        いない。探せば必ず見つかる場所を、ここに1つ残す。
      */}
      <SettingsList label="学習" testId="settings-learning">
        <SettingsRow icon={IconClock} title="学習記録" onClick={onOpenRecord} />
        <SettingsRow icon={IconBookmark} title="あとで見る" onClick={onOpenSaved} />
      </SettingsList>

      <SettingsList label="アカウント">
        <SettingsRow
          icon={IconPerson}
          title="アカウント設定"
          onClick={() => onOpen("account")}
        />
        {/*
          「Credit」とは書かない。

          こちらの帳簿の言葉で、使う人の言葉ではない。見に来る人が
          知りたいのは「あと何回AIに頼めるか」なので、そう書く。
          上の帯にも出さない——常時大きく出すと、学習より残りの回数の
          ほうが目的に見えてくる。
        */}
        <SettingsRow
          icon={IconSparkle}
          title="AI利用状況"
          onClick={() => onOpen("credit")}
        />
      </SettingsList>

      <SettingsList label="アプリ">
        <SettingsRow icon={IconBell} title="通知" onClick={() => onOpen("notification")} />
        <SettingsRow icon={IconSound} title="効果音" onClick={() => onOpen("sound")} />
        <SettingsRow
          icon={IconShield}
          title="学習データ・プライバシー"
          onClick={() => onOpen("privacy")}
        />
        {/*
          規約は1行にまとめる。以前はここに行を置いたうえで、画面の
          いちばん下にも3本の近道を並べていた。同じ行き先が2か所に
          あると、押した人は「別のものかもしれない」と考えてしまう。
        */}
        <SettingsRow
          icon={IconDocument}
          title="規約とポリシー"
          onClick={() => onOpen("legal")}
        />
      </SettingsList>

      {/* 版。囲わない——押すものではないので、面を与える理由が無い */}
      <p className="mt-7 px-1 text-xs text-ink-muted">AIPPO バージョン {APP_VERSION}</p>
    </div>
  );
}

// ---------------------------------------------------------------- 通知設定

function NotificationPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const auth = useAuth();

  /*
    ログイン中は、サーバーが持っている値を正とする。
    端末の値だけを見ていると、別の端末で切ったのに入ったままに見える。
  */
  const [remindStudy, setRemindStudy] = useState(
    auth.user?.remind_study ?? settings.remindStudy,
  );

  useEffect(() => {
    if (auth.user) setRemindStudy(auth.user.remind_study);
  }, [auth.user]);

  async function saveRemindStudy(next: boolean) {
    // 押した瞬間に見た目を変える。往復を待たせると、効いていないように見える
    setRemindStudy(next);
    try {
      await updateReminders(next);
      await auth.refresh();
    } catch {
      // 保存できなかったら戻す。切ったつもりのまま届くのが一番よくない
      setRemindStudy(!next);
    }
  }

  /*
    つまみは1つだけ。

    以前はここに4つ並べ、うち3つ（おすすめ・新機能・メール）を
    「準備中」で止めていた。届く仕組みがあるのは学習リマインダーだけ
    なので、残りは**設定に出さない**。灰色のつまみが3つ並ぶ画面は、
    1つしか動かないことを伝えるのに、いちばん回りくどい形だった。

    設定に出さないだけで、端末に残っている値（notifyUpdates など）は
    消していない。配信の仕組みができた日に、そのまま効く。
  */
  return (
    <SettingsGroup>
      <Toggle
        checked={auth.user ? remindStudy : settings.remindStudy}
        onChange={(next) => {
          onChange({ remindStudy: next });
          if (auth.user) void saveRemindStudy(next);
        }}
        label="学習リマインダー"
        description={
          auth.user
            ? "しばらく開いていないとき、続きのお知らせをメールで受け取る"
            : "登録すると、続きのお知らせをメールで受け取れます"
        }
      />
      {!auth.user && (
        <p className="pt-4 text-xs leading-6 text-ink-muted">
          お知らせを受け取るには登録が必要です。ここで選んだ内容は、登録したときにそのまま使います。
        </p>
      )}
    </SettingsGroup>
  );
}

// -------------------------------------------------------------------- 音

/**
 * 音の設定。
 *
 * 項目はひとつだけだが、通知の中には置かない。通知は「アプリの外から
 * 届くもの」で、これは「画面の中で鳴るもの」。同じ場所に並べると、
 * 音を切ったつもりでメールが止まったように読める。
 *
 * 試せるようにする
 * ----------------
 * 入れたあと、どんな音なのかは鳴らしてみないと分からない。設定を出て
 * レッスンを1歩進めるまで分からない作りにはしない。それに、ブラウザは
 * 「利用者が触るまで音を止める」ので、ここで一度鳴らしておくと、
 * 学習中の1回目から確実に鳴る。
 */
function SoundPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <SettingsGroup description="音量は端末側で調整してください。">
      <Toggle
        checked={settings.successSound}
        onChange={(successSound) => {
          onChange({ successSound });
          // 入れた瞬間に鳴らす。何が鳴るのか、その場で分かるようにする
          if (successSound) previewSuccessSound();
        }}
        label="できたときの音"
        description="1歩進むたびに、短い音を鳴らします"
      />

      {/*
        切っているときも押せる。
        どんな音かを聞いてから決められるようにする——入れないと試せない
        作りだと、「よく分からないが一度入れてみる」しか道が無くなる。
      */}
      <button
        type="button"
        data-testid="sound-preview"
        onClick={() => previewSuccessSound()}
        className="mt-4 min-h-[2.75rem] rounded-cta border border-line px-5 py-2
                   text-sm font-bold text-brand-dark transition hover:bg-brand-soft"
      >
        音を試す
      </button>
      <p className="mt-3 text-xs leading-6 text-ink-muted">
        音が鳴らなくても、できたことは画面の文字で必ず分かります。
      </p>
    </SettingsGroup>
  );
}

// -------------------------------------------------- 学習データ・プライバシー

function PrivacyPanel({
  onNotice,
  onResetSettings,
}: {
  onNotice: (message: string) => void;
  onResetSettings: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const download = () => {
    /*
      端末の中だけで作って渡す。サーバーへは何も送らない。
      Blob の URL は使い終わったら手放す（放っておくと居座る）。
    */
    const blob = new Blob([exportLearningData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aippo-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onNotice("学習データを書き出しました。");
  };

  return (
    <div>
      <SettingsGroup
        title="いま預けているもの"
        description="AIPPOは、入力した文章をサーバーに保存していません。"
      >
        <ul className="space-y-2 text-xs leading-6 text-ink-muted" role="list">
          <li>・進み具合や設定は、この端末の中だけに置いています</li>
          <li>・AIへ送った文章は、答えを作るあいだだけ使い、残しません</li>
          <li>・どの画面を開いたかの記録は、名前と結び付けずに数えています</li>
        </ul>

        <button
          type="button"
          onClick={download}
          className="mt-4 min-h-[2.75rem] rounded-cta border border-line px-5 py-2
                     text-sm font-bold text-brand-dark transition hover:bg-brand-soft"
        >
          学習データを書き出す
        </button>
      </SettingsGroup>

      <SettingsGroup
        title="学習データの削除"
        description="進み具合・下書き・診断の結果を、この端末から消します。"
      >
        {/*
          一度で消さない。取り消せない操作なので、2手に分ける。
          「削除する」を押した時点では、まだ何も消えていない。
        */}
        {confirming ? (
          <div
            className="rounded-card bg-caution-soft p-4"
            role="alertdialog"
            aria-label="学習データの削除の確認"
          >
            <p className="text-sm font-bold leading-7 text-caution">
              消すと元に戻せません。よろしいですか？
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirming(false)}
                className="min-h-[2.75rem] flex-1 rounded-cta bg-brand px-5 py-2
                           text-sm font-bold text-white shadow-raised transition
                           hover:brightness-110"
              >
                やめる
              </button>
              <button
                type="button"
                data-testid="confirm-delete"
                onClick={() => {
                  const removed = clearLearningData();
                  setConfirming(false);
                  onNotice(
                    removed.length === 0
                      ? "消すデータはありませんでした。"
                      : "学習データを消しました。",
                  );
                }}
                className="min-h-[2.75rem] flex-1 rounded-cta border border-caution/30
                           bg-surface px-5 py-2 text-sm font-bold text-caution
                           transition hover:bg-caution-soft"
              >
                消す
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="delete-data"
            onClick={() => setConfirming(true)}
            className="min-h-[2.75rem] rounded-cta border border-caution/30 px-5 py-2
                       text-sm font-bold text-caution transition hover:bg-caution-soft"
          >
            学習データを削除する
          </button>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="設定を初期状態に戻す"
        description="学習の記録は消えません。設定だけを既定へ戻します。"
      >
        <button
          type="button"
          onClick={() => {
            onResetSettings();
            onNotice("設定を初期状態に戻しました。");
          }}
          className="flex min-h-[2.75rem] items-center gap-2 rounded-cta border
                     border-line px-5 py-2 text-sm font-bold text-brand-dark
                     transition hover:bg-brand-soft"
        >
          <IconRefresh className="h-4 w-4 shrink-0" />
          設定を戻す
        </button>
      </SettingsGroup>

      {/* 相談先。困ったときの行き先を必ず1つ置く。囲わない——読むだけの文 */}
      <div className="mt-6 flex items-start gap-3 px-1">
        <IconMark icon={IconChat} className="mt-0.5 h-5 w-5" />
        <p className="min-w-0 flex-1 text-xs leading-6 text-ink-muted">
          {PRIVACY.title}に、預かるものと預からないものを書いています。
          設定の「規約とポリシー」から読めます。
        </p>
      </div>
    </div>
  );
}
