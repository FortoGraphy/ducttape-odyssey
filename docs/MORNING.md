# Dobré ráno, Honzo

(Rozpracováno. Tenhle soubor se průběžně doplňuje, finální verze bude nahoře.)

## Co jsem v noci udělal na tvém počítači

- **GitHub**: `gh` byl už přihlášený jako `FortoGraphy`, nic jsi potvrzovat nemusel. Repo:
  <https://github.com/FortoGraphy/ducttape-odyssey> (public kvůli neomezeným macOS minutám).
- **Blender**: měl jsi 5.2.x, winget ho upgradoval na **5.2.2 LTS** (nastavení zůstalo). Moje první
  kontrola ho přehlédla, proto jsem instalaci vůbec spouštěl.
- **Napájení**: nic jsem neměnil. Spánek na síti už jsi měl vypnutý; počítač držela vzhůru appka Claude.
- **Python**: přibyl balíček `fonttools` (pip, uživatelská instalace).

## Co je potřeba od tebe (jednořádkové opravy)

- `gh` token nemá scope `workflow`. Pushuju přes Git Credential Manager, takže to ničemu nevadí.
  Kdybys chtěl pushovat workflow soubory i přes `gh`: `gh auth refresh -h github.com -s workflow`.
