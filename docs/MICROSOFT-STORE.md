# Publishing Steam Redesigned to the Microsoft Store

The Store version is an MSIX package that **Microsoft signs** when it passes certification. A
Store-signed app installs without SmartScreen's "Windows protected your PC" warning, and you don't need
to buy a code-signing certificate. The Store also installs updates for people automatically.

## 1. Create the developer account (free for individuals)

1. Go to <https://storedeveloper.microsoft.com> and sign in with your personal Microsoft account.
2. Choose **Individual**. There is no fee and no credit card. Microsoft checks your identity with a
   government ID and a selfie.
3. When it is done you land in **Partner Center**.

## 2. Reserve the app name

Partner Center > **Apps and games** > **New product** > **MSIX or PWA app**, then reserve a name.

> **Name and logo:** "Steam" is Valve's trademark, and the app icon is a Steam-style emblem. Store
> certification often rejects apps whose name or logo uses another company's brand. If it's rejected
> for that, reserve a name such as **Project Vanguard: Game Store Browser** and use a logo without the
> Steam emblem, then rebuild.

## 3. Put the app's identity into the build

Partner Center > your app > **Product management** > **Product identity**. Copy these three values into
`tools/store-identity.json`:

| Partner Center field | `store-identity.json` key |
| --- | --- |
| Package/Identity/Name | `identityName` |
| Package/Identity/Publisher (starts with `CN=`) | `publisher` |
| Package/Properties/PublisherDisplayName | `publisherDisplayName` |

## 4. Build the package

```bash
npm run dist:store
```

This writes `dist-store/Steam-Redesigned-<version>.appx`. It is left unsigned on purpose: the Store
signs it. The build uses electron-builder's current Windows kit, copied to a plain temp folder because
`makeappx.exe` won't start from electron-builder's cache folder on current Windows 11.

## 5. Submit

In the app's **Submission**:

- **Packages:** upload the `.appx`.
- **Properties:** category *Utilities & tools* (or *Entertainment*). Privacy policy URL:
  `https://projection-of-vanguard.github.io/privacy.html`.
- **Age ratings:** fill in the questionnaire. The app shows store content and links to other sites, and
  has an AI chat that users connect with their own key.
- **Store listing:** description, at least one screenshot (the GitHub page's screenshots work), and the
  app icon.
- **Notes for certification:** the app's restricted capability is `runFullTrust`, which every desktop
  (Electron) app needs. Explain that it is a desktop app that reads public Steam store data, and that AI
  features need the user's own free key, so testers can skip them.

Certification usually takes from a few hours to a few days.

## How the Store version differs

- **Start with Windows:** a Store app can't add itself to startup. The package declares a startup
  task, and Settings > Desktop app has a **Startup settings** button that opens Windows Settings >
  Apps > Startup, where people switch on "Steam Redesigned".
- **Updates** come from the Store. Settings > About says so, and still links the GitHub page.
- **Everything else** is the same app, with the same security fuses and settings.
