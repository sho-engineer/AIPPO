# Lesson Release Gate

`published` にしてよい条件。**1つでも欠けたら公開しない。**

---

## 中身

- [ ] Learning Goal が**1つ**
- [ ] AI技が原則2〜3個
- [ ] AI技が `content/skill-registry.yaml` に存在する
- [ ] 既存 Lesson との重複を確認した（重なるなら `review` / `application`）
- [ ] Section が原則3〜4
- [ ] 各 Section の必須8項目がすべて埋まっている
- [ ] AI Prompt が定義済み
- [ ] Expected output が定義済み
- [ ] Failure handling が定義済み
- [ ] 必要画像の**判断が記録されている**（作らない判断も含む）

## 動き

- [ ] Lesson 開始から Home 復帰まで完走できる
- [ ] AI 生成の品質を確認した（条件を変えると、変えたぶんだけ変わる）
- [ ] iPhone 相当（320 / 375 / 390 / 430）で確認した
- [ ] Back / Close が正常
- [ ] Layout Shift なし
- [ ] Text Flash なし

## 検査

- [ ] `npm run validate:lessons` — Error 0件
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npx playwright test`
- [ ] `pytest -q` / `ruff check .`

## 判定

- [ ] P0 が0件
- [ ] リリースを阻害する P1 が0件
- [ ] **人による最終承認**

---

## AI も CI も published にしない

これは決まりであって、運用の慣習ではない。

- AI が作った Lesson は **`draft` から始める**
- CI を通っても、上げてよいのは **`review` まで**
- `published` にできるのは**人だけ**

CI が緑であることは「壊れていない」ことしか言わない。**教材として
成り立っているか**は、通して読んだ人にしか分からない。

## 流れ

```
Pull Request
   ↓
CI（Lesson validation / lint / typecheck / test / build / E2E）
   ↓
Preview Deployment（Vercel）
   ↓
実ブラウザQA（iPhone 相当で完走）
   ↓
Human Approval
   ↓
published へ変更（RELEASE_COMING_SOON から1行消す）
   ↓
Production Deployment（main へ）
```

## GitHub 側の設定（このRepositoryからは設定できない）

次は**手動で設定する必要がある**。コードからは入れられないので、
設定済みとして扱わないこと。

- [ ] `main` の Branch Protection
- [ ] Required status checks（CI の4ジョブ）
- [ ] Required review（1名以上）
- [ ] Force push の禁止

**現時点では未設定。** 設定するまでは、`main` へ直接 push できる状態。
