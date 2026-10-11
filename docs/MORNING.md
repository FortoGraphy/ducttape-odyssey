# Dobré ráno, Honzo

## 1. Co máš v ruce

Hra **Duct Tape Odyssey** je složená, hratelná od začátku do prestiže a postavená jako dvě IPA.

- **Build:** <https://github.com/FortoGraphy/ducttape-odyssey/actions/runs/38115093227>
  **zelený**, oba artefakty jsou ke stažení (plný 27 MB, lite 26 MB). Obě IPA mám stažené i lokálně
  v `build/ipa/`.
- **Co nainstalovat jako první:** `DuctTapeOdyssey-release` (plná verze se Skia).
  Když spadne hned po startu, spusť ji ještě jednou (po dvou pádech naběhne nouzový režim). Když
  nepomůže ani to, nainstaluj `DuctTapeOdyssey-release-lite`. Obě mají stejné Bundle ID a sdílejí save.
- **Návod na instalaci:** [INSTALACE.md](INSTALACE.md)

## 2. Poctivě: co se v noci stalo

Kolem 0:20 narazil účet na **limit využití** a všech 13 paralelních agentů spadlo. Práce se
rozběhla znovu až v 5:38 po tvé zprávě. Druhá vlna (herní obrazovky) proto jela v úsporném režimu:
méně kol kontroly screenshotů na agenta. Hra je celá, ale neprošla samostatným QA průchodem
nezávislým recenzentem ani závěrečným „juice“ kolem, které byly v plánu.

**Na telefonu neběželo vůbec nic.** Všechno je ověřené testy, simulací a webovým náhledem
(375×812 @3x). Viz sekce 5.

## 3. Kontrolní seznam na telefonu (10 bodů, pár minut)

1. Appka naběhne a ukáže probouzecí intro („Dobré ráno“). Text má háčky a čárky.
2. Nahoře je pixelartový výhled s lodí, mlhovinou a hvězdou, pixely jsou ostré a obraz plynulý.
3. Tutoriál: KIPP tě provede 6 kroky (koupit Těžbu, podržet výhled, sebrat šrot, cíle, Rafinerie).
4. Klávesy mají haptiku a cvaknutí; hraje tichá hudba (zkontroluj i tichý přepínač: má ji umlčet).
5. Podržení výhledu těží rychleji a roste ukazatel tepla; klepnutí na poletující šrot přidá kredity.
6. Koupě úrovně paluby: číslo na LCD naskočí, cena vzroste, kredity ubudou.
7. Zavři appku na pár minut a otevři ji: objeví se **Lodní deník** s tím, co se nasbíralo offline.
8. Servis → Uložená hra → Exportovat: kód se zkopíruje; Importovat ho přijme a ukáže shrnutí.
9. Servis → Barva panelu: přepnutí den/noc; Jazyk: čeština/angličtina.
10. Po ~5 minutách hraní: odemkne se Výroba, první událost s volbami, první minihra (jde i „Automaticky“).

Když něco z toho nesedí, napiš mi číslo bodu a co jsi viděl.

## 4. Co ve hře je (ověřeno automaticky)

- **Engine** (481 testů zelených): 13 palub, výtah a náklad, crafting s frontami a kvalitou,
  technická mřížka se sousedstvím, opotřebení a opravy, aktivní hraní, procedurální galaxie,
  navigace, planety, expedice, události, 8 poruchových stavů se záchranou, posádka, karty, stanice,
  výzkum, 3 vrstvy prestiže, příběh, KIPP, achievementy, denní a týdenní úkoly, offline výpočet.
- **Obsah** (`npm run validate` bez chyb): 187 předmětů, 166 receptů, 82 výzkumů, 121 událostí,
  12 kapitol, 60 deníků posádky, 298 hlášek KIPPa, 143 achievementů, 9 miniher × 3 obtížnosti.
  Vše česky i anglicky, každý znak má glyf ve fontu.
- **Tempo** (`npm run sim`, 5 seedů): první nákup 1 s, druhá paluba 20 s, první minihra do minuty,
  první skok ~5 min, první modul ~6 min, **první warp 2 h 52 min**, další warpy medián 2 dny.
- **Žádné zaseknutí** (`npm run fuzz`): 514 stavů, 0 softlocků; z každé poruchy vede odtah i s nulou.
- **Bez zpomalování** (`npm run soak`): 7 herních dní, konstantní cena ticku, žádný únik paměti.
- **Build**: kontrola entitlementů (bez push, iCloudu, background modes), Bundle ID `cz.johny.ducttape`,
  lite bundle prokazatelně bez Skia.

## 5. Známá omezení a co nejde ověřit bez telefonu

- **Start plné verze na iPhonu** (Skia, shadery, offscreen surface) je neověřený. Proto lite IPA,
  nouzový režim a hlídač pádů.
- **Zvuk jsem neslyšel.** Hudba a efekty jsou ověřené jen číselně (bezešvé smyčky, žádné ořezy).
  Jestli je hudba příjemná, musíš posoudit ty. Jde vypnout v Servisu.
- **60 fps, haptika, notifikace, sdílení souboru, tichý přepínač**: jen kód, žádné měření na zařízení.
- **Místo na pultu:** na 13 mini zbývá obsahu záložky asi 215 bodů výšky. Výhled jsem proto zmenšil
  ze 48 % na 44 % a záložka Loď je jeden rolovací seznam. Některé záložky jsou těsné.
- **Balanc pozdní hry:** po 2 hodinách je aktivní hraní 8–12× výnosnější než idle (cíl byl 3–8×).
  Tempo přestavby lodi a restartu vesmíru (2. a 3. vrstva prestiže) simulátor neprošel.
- **Technická mřížka:** umisťování modulů je klepnutím s náhledem změn; tažení prstem není.
- **Lite verze** kreslí zjednodušenou loď; barvy trupu z kosmetiky se v plné verzi zatím projeví
  jen na záložní kresbě lodi, ne na spritu z Blenderu.
- **Kodex** se při warpu zmenší: záznamy z opuštěné galaxie zůstanou jen ty, které sis pojmenoval
  (počty a odměny zůstávají). Jinak by save rostl na megabajty.
- **Denní a týdenní úkoly** se přepínají podle UTC, ne podle místní půlnoci.
- Část screenshotů druhé vlny agenti vygenerovali, ale neprohlédli (kvůli úspornému režimu). Sám
  jsem prošel všech 8 záložek, intro, noční téma a poruchový stav; chyby v konzoli žádné.

## 6. Co jsem udělal na tvém počítači

- **GitHub**: `gh` byl už přihlášený jako `FortoGraphy`. Repo je public:
  <https://github.com/FortoGraphy/ducttape-odyssey>. Push jde přes Git Credential Manager, protože
  `gh` token nemá scope `workflow` (kdybys ho chtěl: `gh auth refresh -h github.com -s workflow`).
- **Blender**: winget upgradoval tvůj 5.2.x na **5.2.2 LTS** (nastavení zůstalo).
- **Napájení**: beze změny (spánek na síti jsi měl vypnutý).
- **Nainstalováno**: Python balíček `fonttools`; v projektu `playwright` + Chromium pro screenshoty.

## 7. Stav buildu

Běh 38115093227 (commit `c6af973`): **checks, build (skia) i build (lite) zelené.**
Staženou plnou IPA jsem rozbalil a zkontroloval: Bundle ID `cz.johny.ducttape`, verze 1.0.0, jen
na výšku, žádné background modes ani entitlementy, 7 fontů, 64 zvuků, JS bundle 7,7 MB, rozbalená
78 MB. Tag `v1.0.0` spouští ještě jeden build ze stejného kódu (plus oprava jednoho popisku).
