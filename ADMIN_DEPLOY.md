# RangerEpic 管理後台部署

目前玩家端繼續由 GitHub Pages 部署；本文件的 Admin Server 專門提供登入、Ranger Editor 與可寫入的 API。

## 架構

- 玩家端：GitHub Pages，使用 `npm run build:play`。
- 管理端：EC2 / Node.js，使用 `npm run build:admin` + `npm run start:admin`。
- 管理端新增、修改或刪除 Ranger 後，可自動 `git commit` + `git push origin main`。
- push 後既有 GitHub Pages workflow 會重新部署玩家端。

## 1. 建置

```bash
cd /home/ubuntu/rangerepic
git pull --ff-only
npm ci
npm run check:admin
npm run build:admin
```

## 2. 產生管理員密碼雜湊

```bash
npm run hash:admin-password
```

把輸出的完整 `scrypt$...` 值放進環境檔的 `ADMIN_PASSWORD_HASH`。不要把真正的密碼、雜湊或 Session secret 提交進 Git。

Session secret 可用：

```bash
openssl rand -hex 32
```

建立 `/home/ubuntu/rangerepic-admin.env`，可從 `deploy/rangerepic-admin.env.example` 複製。正式環境建議至少：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=4174
ADMIN_PASSWORD_HASH=scrypt$...
SESSION_SECRET=...
COOKIE_SECURE=true
TRUST_PROXY=true
AUTO_GIT_PUSH=true
GIT_REMOTE=origin
GIT_BRANCH=main
```

## 3. Git 寫入權限

後台自動同步使用 EC2 工作目錄內的 `git`。因此 `/home/ubuntu/rangerepic` 的 `origin` 必須具有對 `mti0224/rangerepic` 的寫入權限。

建議使用 GitHub SSH key / deploy key，並先在 EC2 手動確認：

```bash
cd /home/ubuntu/rangerepic
git push --dry-run origin HEAD:main
```

如果不希望後台自動提交，可先設：

```dotenv
AUTO_GIT_PUSH=false
```

此時新增、修改與刪除仍會寫入 EC2 本機，但不會 commit/push。

## 4. systemd

```bash
sudo cp deploy/rangerepic-admin.service.example /etc/systemd/system/rangerepic-admin.service
sudo systemctl daemon-reload
sudo systemctl enable --now rangerepic-admin
sudo systemctl status rangerepic-admin
```

測試：

```bash
curl http://127.0.0.1:4174/healthz
```

應回傳：

```json
{"ok":true,"service":"rangerepic-admin"}
```

## 5. Nginx

`deploy/nginx-rangerepic-admin.conf.example` 預設示範：

```text
admin.rangerepic.warmycat.com
```

若使用其他網域，先修改 `server_name`。

```bash
sudo cp deploy/nginx-rangerepic-admin.conf.example /etc/nginx/sites-available/rangerepic-admin
sudo ln -s /etc/nginx/sites-available/rangerepic-admin /etc/nginx/sites-enabled/rangerepic-admin
sudo nginx -t
sudo systemctl reload nginx
```

之後再依目前伺服器的 HTTPS / Certbot 配置替此子網域啟用 TLS。正式環境 `COOKIE_SECURE=true` 時必須使用 HTTPS。

## 管理流程

登入後仍使用原本的 Ranger Editor：

1. 輸入 Ranger ID。
2. 後台呼叫 `POST /api/fetch-ranger`。
3. 自動下載 body / thumb / bul 等資源到 `public/rangers/<id>/`。
4. 抓取角色與技能資料，產生 `stats.json` / `gamedata.json`。
5. 在 Editor 編輯並儲存 `ranger.json`。
6. 若 `AUTO_GIT_PUSH=true`，後台會自動 commit + push。
7. `main` 更新後，GitHub Pages workflow 自動重建玩家端。

刪除 Ranger 時不直接永久刪除資料，而是移到 `data/deleted-rangers/`；公開的 `public/rangers/<id>` 會從 Git 中移除。

## 安全設計

- 密碼只在 Node Admin Server 驗證，不會進入 React bundle。
- 建議使用 scrypt 雜湊，不直接存明碼密碼。
- Session Cookie 使用 HttpOnly、SameSite=Strict；正式 HTTPS 環境使用 Secure。
- 登入同一 IP 15 分鐘內最多連續失敗 5 次。
- 所有 `/api/*`、Editor 靜態檔與 Ranger 即時資源都需要登入。
- GitHub Pages 玩家端完全不包含管理 API 或管理密碼。
