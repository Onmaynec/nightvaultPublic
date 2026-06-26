# NightVault release and auto-update guide

Автообновления работают через `electron-updater`, `electron-builder` и GitHub Releases.

## Как выпустить новую версию

1. Измени версию в `package.json`, например:

```bash
npm version 1.0.0 --no-git-tag-version
```

2. Обнови `assets/changelog.json` — добавь блок для новой версии.

3. Сделай коммит и тег:

```bash
git add .
git commit -m "Release 1.0.0"
git tag v1.0.0
git push
git push origin v1.0.0
```

4. GitHub Actions сам соберёт `NightVault-Setup-1.0.0.exe`, `latest.yml` и загрузит их в GitHub Releases.

## Как обновляются пользователи

1. Пользователь запускает установленный NightVault.
2. Приложение проверяет GitHub Releases.
3. Если версия новее — появляется окно «Доступно обновление».
4. Пользователь нажимает «Обновить».
5. Приложение скачивает обновление, закрывается и запускается уже новой версией.
6. После запуска один раз показывается окно «Что нового».

## Важно

Автообновления работают только в установленной packaged-версии приложения. В режиме `npm run client` будет показано, что это dev-режим.
