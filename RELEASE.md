# 发布流程（RELEASE.md）

> 每次发版按此流程执行，保持 GitHub / npm / 市场三渠道同步。

## 前置条件

- 本机已登录 npm（Automation token 或 `npm login`）
- GitHub token（repo 权限，推送用）

## 流程（5 步）

### 1. 版本号

`package.json` 的 `version` 与 git tag 保持一致：

```bash
# 手动改 package.json version（如 0.7.1 → 0.8.0），或：
npm version patch   # 0.7.1 → 0.7.2（会自动改 package.json 并打 tag，但 tag 推送要单独做）
```

> 注意：`npm version` 会自己打 tag 并 commit；若手动改 version 需自行 commit。

### 2. 测试 + 提交

```bash
node --test test/*.test.js   # 必须全绿
git add -A && git commit -m "feat: <英文标题>"
git push origin master
```

### 3. npm 发布

```bash
npm publish --access public --//registry.npmjs.org/:_authToken=<Automation token>
```

> Automation token（`npm_` 开头）免 OTP；Publish token 每次要手机验证码。

### 4. GitHub Release + tarball

```bash
git tag v<版本>                    # 如 v0.7.1
git push origin tag v<版本>
npm pack                          # 生成 <name>-<version>.tgz
```

然后在 GitHub 网页（或 API）创建 Release：
- Tag: `v<版本>`
- 标题: `v<版本>`
- 正文: 变更摘要（中英均可）
- 资产: 上传 `npm pack` 生成的 tgz

市场专用 URL（创建后自动生效）：
`https://github.com/chunfenxiazhi-collab/dsh-stability-audit/releases/latest/download/dsh-stability-audit-<版本>.tgz`

### 5. 验证

```bash
# npm
curl https://registry.npmjs.org/dsh-stability-audit | grep dist-tags
# release 资产（HEAD 请求应 200）
curl -I https://github.com/chunfenxiazhi-collab/dsh-stability-audit/releases/latest/download/dsh-stability-audit-<版本>.tgz
```

## 快速检查清单

- [ ] 测试全绿
- [ ] package.json version 与 tag 一致
- [ ] npm publish 成功（Automation token）
- [ ] git tag 已推送
- [ ] Release 创建 + tarball 上传
- [ ] releases/latest 下载 200
- [ ] CHANGELOG.md 已更新（如有）
