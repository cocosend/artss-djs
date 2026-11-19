# ARTSS DJS · CHAPTER 100

**M100 — THE NEW BEGINNING · 10%**  
*6 ноября 2026 · первая юбилейная контрольная точка.*

> Сто — не финал и не обещание готовности. Это начало новой главы.
> Мы построили основу, проверили её и теперь можем двигаться дальше — увереннее, точнее, выше.

**100 = первые символические 10% большого пути.** Оставшиеся 90% — работа над точностью аудио, качеством взаимодействия, стабильностью и выпуском. Это обозначение этапа, а не измеренный процент функциональной готовности.

---

## Что стало основой

**Нативное DJ-приложение ARTSS DJS** (не DJ Creator и не магазин): React Native iOS + C++20/CoreAudio RemoteIO, один audio callback и единый AudioEngine.

- **Deck A / Deck B:** импорт пользовательских треков, транспорт, CUE и восемь Hot Cues, beat jump, beat loop, ручные IN/OUT/EXIT, BPM, beat-grid и sync.
- **Микшер:** три режима crossfader, независимые фейдеры каналов, EQ, stereo RMS meters, лимитер.
- **Waveform:** фиксированный RGBA8 PCM-кэш с тремя уровнями (96/384/1536), stereo min/max/RMS, низкие/средние/высокие частоты; Metal-отрисовка, playhead и beat-grid. Пустые бины безопасно обнуляются.
- **ARTSS FX:** независимые цепочки на обеих деках и мастере — TPT SVF LPF/HPF, ping-pong delay, reverb, flanger, bitcrusher и квантованный Roll. Буферы выделяются вне audio callback; параметры приходят через атомики.
- **Performance:** оригинальные 303/606/909 PCM-пэды, шестнадцатишаговый секвенсор и демо-грувы Stripewolf, без сторонних записей артистов.

## Что подтверждено на предыдущей контрольной сборке

| Проверка | Результат |
|---|---|
| Исходный FX commit | `7ecf0d7c79ca43408071710dd400cde771e6bec6` |
| Native iOS CI | ✅ GitHub Actions run [42246543423](https://github.com/cocosend/artss-djs/actions/runs/42246543423) |
| DSP / TypeScript / Browser CI | ✅ GitHub Actions run [42246543418](https://github.com/cocosend/artss-djs/actions/runs/42246543418) |
| CodeQL Swift (прежняя ветка) | ⚠️ ошибка настройки autobuild; CHAPTER 100 включает проверенный workflow из PR #87 |
| Подписанная IPA / установка на iPhone / 60–120 FPS / xrun | **Не проверено** |

**Важно:** эта таблица подтверждает родительский коммит. Для самой сотой ветки требуется отдельный зелёный CI на её собственном SHA. Build artifact — unsigned IPA, не App Store/TestFlight release.

## Граница M100

Эта точка фиксирует исходный нативный движок, работу waveform и первую полную FX-цепочку. Мы не создаём второй AudioEngine, не меняем ранее работающие механизмы без причины и не публикуем неподписанное приложение как готовое к массовому релизу.

Дальше — аппаратная проверка на iPhone (xrun, FPS, latency), MIDI, запись, pitch-preserving time-stretch, обнаружение тональности и harmonic mixing, надёжная библиотека, безопасная подпись и выпуск. Приоритет: **качество звука → realtime safety → latency → UX → публикация**.

## Публикация M100

После зелёного CI **Native iOS** и **ARTSS 33** на одном SHA workflow автоматически создаёт GitHub **Pre-release** с проверенной unsigned IPA и SHA-256. Постоянная ссылка: [m100-new-beginning](https://github.com/cocosend/artss-djs/releases/tag/m100-new-beginning) (до завершения CI может отсутствовать). Это не Apple-signed и не App Store release.

## Установка контрольной IPA

1. Открыть успешный [Native iOS workflow](https://github.com/cocosend/artss-djs/actions/workflows/ios-native.yml) для **CHAPTER 100**.
2. Скачать его `ARTSS-DJS-FIX38-UNSIGNED-<run>` artifact и извлечь `.ipa`.
3. В ESign выполнить **Import → Sign (своим сертификатом) → Install**.
4. Проверить запуск, импорт трека, звук и FX; отдельно измерить FPS и xrun на физическом устройстве.

*ARTSS DJS · CHAPTER 100 — новая точка отсчёта. Волна только начинается.*
