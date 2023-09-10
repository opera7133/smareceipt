# Smareceipt

スマレジと中華のレシートプリンターの連携アプリ

## 使い方

1. スマレジ・デベロッパーズからプライベートアプリを作成
2. スコープのpos.transactions:readを有効化
3. クライアントIDとクライアントシークレット、本番環境の契約IDをメモ
4. アプリを本番環境の契約IDでアクティベート
5. `config/example.json`を`config/default.json`にコピーして設定
6. `pnpm i`
7. `pnpm run start`

## コンフィグ

```json5
{
  // ポート
  "port": 38334,
  // 接続方法（"usb" or "bluetooth"）
  "mode": "bluetooth",
  "smaregi": {
    // 契約ID
    "id": "",
    // クライアントID
    "clientId": "",
    // クライアントシークレット
    "clientSecret": ""
  },
  "shop": {
    // レシートに記載される店舗名
    "name": "Example Shop",
    // 〃住所
    "address": "東京都新宿区西新宿2-8-1"
  }
}

```

## アドレス

`/`: 操作用ページ

`/print`: 印刷(GET)

`/hook`: Webhook用(POST)

## 注意

### Windowsの場合

Windows 10/11の場合、Windows SDK ver.22000以上 + Visual Studio 2019/2022 Build Toolが必要です。
chocolateyからインストールしてください。

また、USB接続で印刷を行う場合はZadigをインストールし、該当のプリンターのドライバをWinUSBに変更してください。

### macOSの場合

Bluetoothを使用する場合は、

```plain
設定 -> セキュリティとプライバシー -> プライバシー -> Bluetooth
```

から、ターミナル.appを追加してください。

### Debian / Ubuntuの場合

USBに関するエラーが出た場合、以下のコマンドを実行してください.

```bash
sudo apt install build-essential libudev-dev
```

Bluetoothに関するエラーが出た場合は、以下のコマンドを実行してください。

```bash
sudo apt install bluetooth bluez libbluetooth-dev libudev-dev
```
