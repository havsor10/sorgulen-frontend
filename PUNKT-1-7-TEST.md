# Punkt 1–7 test

Frontend-only. Backend, booking, admin, MongoDB og e-post er ikke endret.

## Endret
1. Fjernet teksten i Smart utleieopplevelse.
2. Fjernet LED-lyskilde-teksten fra Samsung-projektor.
3. Fjernet sand/salt-teksten fra brøytingsiden.
4. Fjernet hele før/etter-seksjonen fra brøytingsiden.
5. Fjernet Tjenester fra desktop- og mobilmeny. `tjenester.html` sender videre til forsiden.
6. Justert bildevisning på lange utleieprodukter.
7. Justert utleiekortbilder slik at bildeflaten fylles i bredden uten stygge sidefelt.

## Test
- Åpne forsiden.
- Åpne hamburger-meny: Tjenester skal være borte.
- Åpne utleiesiden: teksten fra punkt 1 skal være borte.
- Åpne Samsung-projektor: LED-tekst skal være borte.
- Åpne brøytingsiden: sand/salt-tekst og før/etter-seksjon skal være borte.
- Sjekk utleiekort på mobil: ingen grå sidefelt på bilder.
- Sjekk buskrydder produktside: hele produktet skal være synlig.
- Test bookingknapp for Brøyting/Dekkskift.