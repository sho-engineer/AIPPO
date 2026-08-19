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
 * 支給デザインにあって、ここに無いもの
 * ------------------------------------
 * 外部連携・サブスクリプション・ヘルプ・言語設定は、押せる形で置いたうえで
 * 「準備中」と書いて止めてある。課金も翻訳もまだこのアプリに無いため。
 * それらしい画面だけ作ると、触った人は「申し込んだのに反映されない」
 * 「英語にしたのに日本語のまま」と受け取る。無いものは無いと書く。
 *
 * 止め方は4つとも同じにする（行を disabled にして、説明の代わりに
 * 「準備中です」を出す）。同じ「まだ無い」を、ある行は開けて中で断り、
 * ある行は開けない、と分けると、開けた人は「こっちは動くのかもしれない」
 * と読む。1画面の中で扱いを揃えるほうが、言葉を尽くすより早く伝わる。
 *
 * アカウント設定は動く。登録なしでも最後まで使えるので、ここは
 * 「登録しないと始まらない入口」ではなく「残したくなったときの置き場」。
 */

import { useEffect, useState } from "react";

import { AppHeader, Card, IconMark } from "../components/AppShell";
import { AuthDialog } from "../components/auth/AuthDialog";
import { AccountPanel } from "../components/settings/AccountPanel";
import { LegalMenu, LegalView } from "../components/legal/LegalView";
import {
  LEGAL_DOCUMENTS,
  PRIVACY,
  findLegalDocument,
  type LegalDocument,
} from "../content/legal";
import {
  IconBell,
  IconBook,
  IconChat,
  IconDocument,
  IconFolder,
  IconGlobe,
  IconPerson,
  IconQuestion,
  IconRefresh,
  IconShield,
  IconSparkle,
} from "../components/Icons";
import {
  SegmentedChoice,
  SelectField,
  SettingsGroup,
  SettingsRow,
  StepSlider,
  Toggle,
} from "../components/settings/Controls";
import { fetchModels, type AiModelChoice } from "../api/models";
import { updateReminders } from "../api/accounts";
import { useAuth } from "../auth/AuthContext";
import {
  DAILY_GOALS,
  TONES,
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
  | "ai"
  | "study"
  | "notification"
  | "privacy"
  | "legal"
  | null;

const LENGTH_OPTIONS = [
  { value: "short" as const, label: "短め" },
  { value: "standard" as const, label: "標準" },
  { value: "long" as const, label: "長め" },
];

export interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [panel, setPanel] = useState<Panel>(null);
  const [models, setModels] = useState<AiModelChoice[]>([]);
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
    選べるモデルはサーバーに聞く。画面にモデル名を書かない。
    取れなくても設定画面は開く（そのときは「サーバーにまかせる」だけになる）。
  */
  useEffect(() => {
    let alive = true;
    void fetchModels().then((list) => {
      if (alive) setModels(list);
    });
    return () => {
      alive = false;
    };
  }, []);

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
    ai: "AI設定",
    study: "学習設定",
    notification: "通知設定",
    privacy: "学習データ・プライバシー",
    legal: "規約とポリシー",
  };

  return (
    <>
      <AppHeader onBack={back} centered />

      <main className="mx-auto max-w-2xl px-5 pb-28">
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
            onOpen={setPanel}
            onOpenLegal={(id) => {
              setPanel("legal");
              setLegalId(id);
            }}
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
            {panel === "legal" &&
              (legalId === null ? (
                <LegalMenu onOpen={setLegalId} />
              ) : (
                <LegalView document={findLegalDocument(legalId)!} />
              ))}
            {panel === "ai" && (
              <AiPanel settings={settings} models={models} onChange={update} />
            )}
            {panel === "study" && (
              <StudyPanel settings={settings} onChange={update} />
            )}
            {panel === "notification" && (
              <NotificationPanel settings={settings} onChange={update} />
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

function MainMenu({
  onOpen,
  onOpenLegal,
}: {
  onOpen: (panel: Panel) => void;
  onOpenLegal: (id: LegalDocument["id"]) => void;
}) {
  return (
    <div className="animate-fade-up">
      <h1 className="mt-2 text-xl font-bold sm:text-2xl">設定</h1>
      <p className="mt-2 text-sm leading-7 text-ink-muted">
        学習環境や表示をカスタマイズできます。
      </p>

      <Card className="mt-5" padded={false}>
        <ul role="list">
          <SettingsRow
            icon={IconPerson}
            tone="sky"
            title="アカウント設定"
            description="登録・ログイン・パスワード・退会"
            onClick={() => onOpen("account")}
          />
          <SettingsRow
            icon={IconSparkle}
            tone="sky"
            title="AI設定"
            description="AIの答え方や、参考にした情報の見せ方"
            onClick={() => onOpen("ai")}
          />
          <SettingsRow
            icon={IconBook}
            tone="rose"
            title="学習設定"
            description="1日の目標や、解説の出し方"
            onClick={() => onOpen("study")}
          />
          <SettingsRow
            icon={IconBell}
            tone="amber"
            title="通知設定"
            description="受け取る知らせを選びます"
            onClick={() => onOpen("notification")}
          />
          {/*
            言語は選ばせない。

            訳文を1語も用意していないので、English を選べる形にすると
            「選んだのに変わらない」だけが起きる。以前はここを開けたうえで
            画面の中に「まだ切り替わりません」と書いていたが、それは
            **選ばせてから断る**形で、いちばん心証が悪い。
            用意できたら onClick を戻して、下位画面をここへ足す。
          */}
          <SettingsRow
            icon={IconGlobe}
            tone="plain"
            title="言語設定"
            description="画面に出る言葉を選びます"
            disabled
            note="準備中です。いまは日本語のみです"
          />
          <SettingsRow
            icon={IconShield}
            tone="teal"
            title="学習データ・プライバシー"
            description="データの確認や削除"
            onClick={() => onOpen("privacy")}
          />
          <SettingsRow
            icon={IconFolder}
            tone="plain"
            title="外部連携"
            description="カレンダーなどとのつなぎ込み"
            disabled
            note="準備中です"
          />
          <SettingsRow
            icon={IconDocument}
            tone="plain"
            title="サブスクリプション"
            description="プランの確認・変更・解約"
            disabled
            note="準備中です。いまは無料で全部使えます"
          />
          <SettingsRow
            icon={IconDocument}
            tone="violet"
            title="規約とポリシー"
            description="利用規約・プライバシーポリシー・AI利用上の注意"
            onClick={() => onOpen("legal")}
          />
          <SettingsRow
            icon={IconQuestion}
            tone="plain"
            title="ヘルプ・サポート"
            description="使い方やよくある質問"
            disabled
            note="準備中です"
          />
        </ul>
      </Card>

      {/* AIPPO について */}
      <Card className="mt-5">
        <h2 className="text-base font-bold">AIPPOについて</h2>
        <p className="mt-1 text-xs text-ink-muted">バージョン {APP_VERSION}</p>
        {/*
          外部の行き先へは飛ばさない。読むのはアプリの中。
          飛ばすと、登録の途中で読みに行った人が戻れなくなる。
        */}
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2" role="list">
          {LEGAL_DOCUMENTS.map((document) => (
            <li key={document.id}>
              <button
                type="button"
                onClick={() => onOpenLegal(document.id)}
                className="text-xs text-brand-dark underline transition hover:text-brand"
              >
                {document.title}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ AI設定

function AiPanel({
  settings,
  models,
  onChange,
}: {
  settings: Settings;
  models: AiModelChoice[];
  onChange: (patch: Partial<Settings>) => void;
}) {
  /*
    「サーバーにまかせる」を必ず先頭に置く。
    モデルを知らない人がほとんどで、選ばずに済む道が要る。
  */
  const modelOptions = [
    { value: "", label: "おまかせ（推奨）", note: "いちばん向いているものを自動で選びます" },
    ...models.map((model) => ({
      value: model.id,
      label: model.recommended ? `${model.label}（いまの既定）` : model.label,
      note: model.note,
    })),
  ];

  return (
    <Card className="mt-5" padded={false}>
      <SettingsGroup
        title="AIモデル"
        description="迷ったら、おまかせのままで大丈夫です。"
      >
        <SelectField
          label="使うAIモデル"
          labelHidden
          value={settings.aiModel}
          options={modelOptions}
          onChange={(aiModel) => onChange({ aiModel })}
        />
      </SettingsGroup>

      <SettingsGroup title="答え方" description="AIの言葉づかいを選びます。">
        <SegmentedChoice
          legend="答え方"
          value={settings.tone}
          options={TONES}
          onChange={(tone) => onChange({ tone })}
        />
      </SettingsGroup>

      <SettingsGroup
        title="回答の長さ"
        description="レッスンの中で長さを指定したときは、そちらが優先されます。"
      >
        <StepSlider
          label="回答の長さ"
          labelHidden
          value={settings.answerLength}
          options={LENGTH_OPTIONS}
          onChange={(answerLength) => onChange({ answerLength })}
        />
      </SettingsGroup>

      <SettingsGroup title="結果の見せ方">
        <Toggle
          checked={settings.showSources}
          onChange={(showSources) => onChange({ showSources })}
          label="確かめるところを結果のそばに出す"
          description="数字・日付・固有名詞など、自分で確認したほうがよい点を添えます"
        />
      </SettingsGroup>
    </Card>
  );
}

// ---------------------------------------------------------------- 学習設定

function StudyPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <Card className="mt-5" padded={false}>
      <SettingsGroup
        title="1日の目標"
        description="決めた時間に届かなくても、記録に×は付きません。"
      >
        <SegmentedChoice
          legend="1日の目標"
          value={String(settings.dailyGoalMinutes)}
          options={DAILY_GOALS.map((minutes) => ({
            value: String(minutes),
            label: minutes === 0 ? "決めない" : `${minutes}分`,
          }))}
          onChange={(value) => onChange({ dailyGoalMinutes: Number(value) })}
        />
      </SettingsGroup>

      <SettingsGroup title="解説の出し方">
        <Toggle
          checked={settings.autoOpenConcepts}
          onChange={(autoOpenConcepts) => onChange({ autoOpenConcepts })}
          label="短い解説をレッスンの中に挟む"
          description="切ると、操作だけで進みます（あとから読み直せます）"
        />
      </SettingsGroup>
    </Card>
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

  return (
    <Card className="mt-5" padded={false}>
      <SettingsGroup
        title="受け取る知らせ"
        description="いつでも切り替えられます。"
      >
        {/*
          学習リマインダーだけは、実際にメールが届く。
          送るのはサーバーなので、切り替えもサーバーへ伝える
          （端末にだけ持たせると「切ったのに届く」ことになる）。
        */}
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
        <Toggle
          checked={settings.notifyRecommendations}
          onChange={(notifyRecommendations) => onChange({ notifyRecommendations })}
          label="おすすめ教材の通知"
          description="あなたに合った教材の提案を受け取る"
        />
        <Toggle
          checked={settings.notifyUpdates}
          onChange={(notifyUpdates) => onChange({ notifyUpdates })}
          label="新機能・アップデート情報"
          description="新機能やお知らせを受け取る"
        />
        <Toggle
          checked={settings.notifyByEmail}
          onChange={(notifyByEmail) => onChange({ notifyByEmail })}
          label="メール通知"
          description="重要なお知らせをメールで受け取る"
        />
      </SettingsGroup>

      {/*
        届くのは「学習リマインダー」だけ。残り3つはまだ配信の仕組みが無い。
        全部が届くように見せない——1つでも届かないものがあるなら、
        どれが届くのかを書くほうが正直になる。
      */}
      <div className="px-4 pb-5">
        <p className="rounded-card bg-brand-soft px-4 py-3 text-xs leading-6 text-brand-dark">
          {auth.user
            ? "いま実際に届くのは「学習リマインダー」だけです。残りは送る仕組みを用意しているところで、選んだ内容は残しておきます。"
            : "お知らせを受け取るには登録が必要です。ここで選んだ内容は、登録したときにそのまま使います。"}
        </p>
      </div>
    </Card>
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
    <div className="mt-5 space-y-4">
      <Card padded={false}>
        <SettingsGroup
          title="いま預けているもの"
          description="AIPPOは、入力した文章をサーバーに保存していません。"
        >
          <ul className="space-y-2 text-xs leading-6 text-ink-muted" role="list">
            <li>・進み具合や設定は、この端末の中だけに置いています</li>
            <li>・AIへ送った文章は、答えを作るあいだだけ使い、残しません</li>
            <li>・どの画面を開いたかの記録は、名前と結び付けずに数えています</li>
          </ul>
        </SettingsGroup>

        <div className="flex flex-wrap gap-3 px-4 pb-5">
          <button
            type="button"
            onClick={download}
            className="min-h-[2.75rem] rounded-cta bg-surface px-5 py-2 text-sm
                       font-bold text-brand-dark shadow-card transition
                       hover:bg-brand-soft"
          >
            学習データを書き出す
          </button>
        </div>
      </Card>

      <Card padded={false}>
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
                  className="min-h-[2.75rem] flex-1 rounded-cta bg-surface px-5 py-2
                             text-sm font-bold text-caution shadow-card transition
                             hover:bg-caution-soft"
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
              className="min-h-[2.75rem] rounded-cta bg-surface px-5 py-2 text-sm
                         font-bold text-caution shadow-card transition
                         hover:bg-caution-soft"
            >
              学習データを削除する
            </button>
          )}
        </SettingsGroup>
      </Card>

      <Card padded={false}>
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
            className="flex min-h-[2.75rem] items-center gap-2 rounded-cta bg-surface
                       px-5 py-2 text-sm font-bold text-brand-dark shadow-card
                       transition hover:bg-brand-soft"
          >
            <IconRefresh className="h-4 w-4 shrink-0" />
            設定を戻す
          </button>
        </SettingsGroup>
      </Card>

      {/* 相談先。困ったときの行き先を必ず1つ置く */}
      <Card>
        <div className="flex items-center gap-3">
          <IconMark icon={IconChat} className="h-5 w-5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">データの扱いについて聞きたい</h2>
            <p className="mt-0.5 text-xs leading-6 text-ink-muted">
              {PRIVACY.title}に、預かるものと預からないものを書いています。
              設定の「規約とポリシー」から読めます。
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
