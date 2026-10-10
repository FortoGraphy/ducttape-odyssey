# Duct Tape Odyssey – instalace na iPhone 13 mini (zdarma, z Windows)

Návod od stažení hotové appky z GitHubu po nahrání do iPhonu přes Sideloadly.

> **Jak to funguje**
> 1. Kód je na GitHubu. GitHub Actions má zdarma Mac, který z kódu postaví **nepodepsaný `.ipa`**.
> 2. **Sideloadly** na Windows ten `.ipa` podepíše tvým **bezplatným Apple ID** a nahraje ho do iPhonu.
> 3. S bezplatným Apple ID vyprší podpis po **7 dnech**. Sideloadly ho umí obnovovat samo přes Wi-Fi.

---

## 1. Stáhni si appku

1. Otevři <https://github.com/FortoGraphy/ducttape-odyssey/actions> a klikni na poslední zelený běh
   workflow **iOS build (unsigned IPA)**.
2. Dole v sekci **Artifacts** jsou dva soubory:
   - **`DuctTapeOdyssey-release`** – plná verze (Skia, všechny efekty). **Tuhle zkus jako první.**
   - **`DuctTapeOdyssey-release-lite`** – záložní verze bez Skia a shaderů. Použij ji jen tehdy,
     když plná verze na telefonu spadne hned po spuštění.
3. Stáhni artifact a rozbal ZIP. Uvnitř je soubor `.ipa`.

> Obě verze mají **stejné Bundle ID** (`cz.johny.ducttape`), takže se navzájem přepisují a
> **sdílejí uloženou hru**. Můžeš mezi nimi přecházet bez ztráty postupu.

Nový build spustíš na stejné stránce tlačítkem **Run workflow** (trvá asi 15–20 minut).

---

## 2. Připrav Windows pro Sideloadly (jen poprvé)

1. **Odinstaluj** iTunes a iCloud z Microsoft Store, pokud je máš. Sideloadly potřebuje verze
   **přímo od Applu**:
   - iTunes (64bit): <https://www.apple.com/itunes/download/win64>
   - iCloud: <https://support.apple.com/en-us/103232> (klasický instalátor, ne verze ze Store)
2. Nainstaluj **Sideloadly**: <https://sideloadly.io/>
3. Připoj iPhone kabelem, odemkni ho a na dotaz **Důvěřovat tomuto počítači?** klepni na **Důvěřovat**.
4. V iTunes klikni na ikonku telefonu a zaškrtni **Synchronizovat s tímto iPhonem přes Wi-Fi**,
   pak **Použít**. To je potřeba pro automatickou obnovu podpisu.

Pokud už ti takhle běží Moje Mapy, máš hotovo a tenhle krok přeskoč.

---

## 3. Nahraj appku do iPhonu

1. Spusť Sideloadly a přetáhni do okna soubor `.ipa`.
2. Nahoře vyber svůj iPhone a do pole **Apple account** napiš e-mail svého Apple ID.
3. Klikni na **Advanced options**:
   - **Signing mode**: `Apple ID Sideload`
   - zaškrtni **Automatically refresh**
   - **Bundle ID nech výchozí** (`cz.johny.ducttape`) – viz varování níže.
4. Klikni na **Start** a zadej heslo k Apple ID (případně kód dvoufázového ověření).
5. Na iPhonu (jen poprvé):
   - **Nastavení → Soukromí a zabezpečení → Režim pro vývojáře**: zapnout (telefon se restartuje).
   - **Nastavení → Obecné → Správa VPN a zařízení**: klepni na své Apple ID a pak **Důvěřovat**.
6. Spusť **Duct Tape Odyssey**.

### ⚠️ Bundle ID se nesmí změnit

Uložená hra je svázaná s Bundle ID `cz.johny.ducttape`. Když ho v Sideloadly změníš (volba
**Change bundle ID**), iPhone to bere jako **jinou appku a začneš od nuly**. Kdyby Sideloadly
výchozí ID odmítlo, nejdřív si ve hře udělej **export uložené hry** (viz níže), pak teprve ID změň
a uloženou hru naimportuj.

### Omezení bezplatného Apple ID

- Podpis platí **7 dní**. S „Automatically refresh“ a zapnutým Sideloadly na PC ve stejné Wi-Fi se
  obnovuje sám. Jinak stačí jednou týdně nahrát znovu stejný `.ipa` – **data ve hře zůstanou**.
- Najednou můžeš mít max. **3** takto nahrané appky (Moje Mapy jsou jedna z nich) a vytvořit max.
  10 App ID za týden.
- Žádné push notifikace, žádný iCloud, žádný běh na pozadí. Hra používá jen **lokální notifikace**
  a postup „offline“ dopočítá při návratu.

---

## 4. Zálohuj si uloženou hru

Protože podpis každý týden vyprší a appka není z App Storu, **nespoléhej jen na telefon**:

- Ve hře: **Nastavení → Uložená hra → Exportovat**. Dostaneš kód (zkopíruje se do schránky) nebo
  soubor přes sdílení (pošli si ho mailem, ulož do Souborů).
- Obnova: **Nastavení → Uložená hra → Importovat** a vlož kód nebo vyber soubor.
- Hra ti zálohu občas sama připomene. Připomínku jde v nastavení vypnout.

Když appka po týdnu nejde otevřít, **neodinstalovávej ji** – odinstalace smaže data. Jen ji znovu
nahraj přes Sideloadly.

---

## 5. Když něco nejde

| Problém | Řešení |
| --- | --- |
| Appka spadne hned po spuštění | Spusť ji ještě jednou: po dvou nepovedených startech naběhne **nouzový režim** bez efektů. Když ani to nepomůže, nahraj **`release-lite`** (uložená hra zůstane). |
| Ve hře svítí „Nouzový režim“ | Hra se dvakrát po sobě nespustila čistě. Hrát jde normálně, jen bez shaderů. V Nastavení je tlačítko **Zkusit plný režim**. |
| Sideloadly: „Please install iTunes“ | Máš verzi z Microsoft Store. Odinstaluj ji a nainstaluj verzi z apple.com (krok 2). |
| Sideloadly: „Your maximum App ID limit has been reached“ | Počkej 7 dní nebo použij jiné Apple ID. Neměň zbytečně Bundle ID. |
| Appka po týdnu nejde otevřít | Vypršel podpis. Nahraj znovu stejný `.ipa` (data zůstanou). |
| „Untrusted Developer“ | Nastavení → Obecné → Správa VPN a zařízení → Důvěřovat. |
| Build na GitHubu selže | V běhu stáhni artifact `build-log-skia` / `build-log-lite` a pošli posledních ~100 řádků. |
| Nechodí notifikace | Zapni je ve hře v Nastavení (iOS se zeptá na povolení) a zkontroluj Nastavení iPhonu → Oznámení. |
| Hra je potichu | Zkontroluj přepínač tichého režimu na boku telefonu – hra ho respektuje. |

---

## 6. Pro zvědavé: jak postavit novou verzi

```powershell
git add -A
git commit -m "změna"
git push
gh workflow run ios-build.yml --ref main -f render=both
```

Lokální kontroly před buildem (šetří čas): `npm run check`, `npm run sim`, `npm run soak`.
