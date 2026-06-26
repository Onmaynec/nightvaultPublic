# NightVault v0.9.6

Стабильная версия с Windows NSIS-установщиком, GitHub Actions и Telegram-style автообновлением.

## Запуск разработки

```cmd
npm install
npm run server
npm run client
```

## Сборка установщика

```cmd
build-installer.bat
```

После сборки файл будет здесь:

```text
dist\NightVault-Setup-0.9.6.exe
```

Ярлык установщика запускает клиентскую часть приложения.

Подробнее: `README_INSTALLER.md`.


## Обновления

1. Измени версию в `package.json` или выполни `npm version patch`.
2. Обнови `assets/changelog.json`.
3. Сделай `git push` и `git push --tags`.
4. GitHub Actions соберёт `NightVault-Setup-<version>.exe` и `latest.yml`.
5. Прикрепи эти файлы к GitHub Release с таким же тегом.

Пользователь увидит окно обновления при запуске установленного клиента. После установки один раз откроется окно «Что нового».
