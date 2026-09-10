# 本番DockerのAdmin bundle生成課題

## 現状

`.docker/prd.Dockerfile`は`ghost:5.116.2-alpine`をベースにし、Backendの変更ファイルを部分的に`COPY`している。一方、Ghost Admin／Admin-Xのソースや生成済み`ghost/core/core/built/admin`はDockerfile内で生成・コピーしていない。

そのため、ローカルのAdmin-Xソースを変更しても、Docker imageにはベースimageに含まれる古いAdmin bundleが残り、`/ghost`の管理画面へ反映されないことがある。

## 暫定対応

image作成前にホスト側でAdminをビルドし、生成物をDockerfileでコピーする。

```bash
yarn workspace ghost-admin build
yarn docker:next:build
```

Dockerfileには次のCOPYを追加する方式を採用する。

```dockerfile
COPY ghost/core/core/built/admin \\
  ${GHOST_INSTALL}/current/core/built/admin
```

この方式では、Docker buildの前にAdmin buildが完了していることをCI／デプロイ手順で保証する必要がある。

## 継続課題

- [ ] Docker buildだけでローカルのGhost Admin／Admin-Xソースからbundleを生成できる構成にする
- [ ] マルチステージbuildでNode／Yarnのbuild環境と実行imageを分離する
- [ ] Admin-X、旧Ghost Admin、Backendのbuild成果物が同一imageへ入ることをCIで検証する
- [ ] `ghost/core/core/built/admin`の未生成・古いbundleを検出してbuildを失敗させる
- [ ] `JPY`などの管理画面変更を含む本番imageの反映確認を自動化する

## 注意

`COPY`方式は暫定策であり、生成物の持ち越しやホスト／CI環境差を防ぐものではない。本番リリースでは、ソースrevisionとAdmin bundleのbuild revisionが一致していることを確認する。

