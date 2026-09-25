# Daily Energy Gradient Card

A custom Home Assistant Lovelace card that displays daily or monthly energy consumption as vertical bars on a fixed green → yellow → red scale.

![Daily Energy Gradient Card preview](assets/daily-energy-gradient-card-preview.jpg)

## Features

- Daily and monthly energy values calculated from Home Assistant long-term statistics (`sum`), like the Energy dashboard.
- Fixed gradient scale: low values stay green; higher values reveal yellow, orange, and red.
- Selectable ranges such as 7, 14, and 30 days.
- Built-in **Days / Months** switch with configurable 3, 6, and 12 month ranges.
- Horizontal scrolling with automatic positioning on the latest period.
- Fast reopening with stale-while-revalidate browser caching.
- Live refresh in the background on every card load.
- Works inside regular dashboards and Bubble Card pop-ups.

## Important

Use a continuous cumulative energy sensor, normally one with:

- `device_class: energy`
- `state_class: total_increasing`
- a unit such as `kWh`

Do not use a monthly `utility_meter` as the source when the original cumulative sensor is available.

## Test installation with HACS

This card is not yet included in the default HACS catalog. Install it for testing as a custom repository.

[![Open your Home Assistant instance and add this repository to HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rbalaev&repository=daily-energy-gradient-card&category=plugin)

Or add it manually:

1. Open **HACS** and go to **Dashboard**.
2. Open the top-right menu and choose **Custom repositories**.
3. Enter `https://github.com/rbalaev/daily-energy-gradient-card`.
4. Select **Dashboard** as the category and click **Add**.
5. Find **Daily Energy Gradient Card** in HACS and click **Download**.
6. Refresh Home Assistant. HACS should register the frontend resource automatically.

The installed resource URL is normally:

```text
/hacsfiles/daily-energy-gradient-card/daily-energy-gradient-card.js
```

## Manual installation

1. Copy `daily-energy-gradient-card.js` to `/config/www/`.
2. Add a JavaScript module resource:

   ```text
   /local/daily-energy-gradient-card.js
   ```

3. Refresh the browser cache.

## Example

```yaml
type: custom:daily-energy-gradient-card
entity: sensor.boiler_energy
name: Boiler energy consumption
mode: daily
days: 7
day_options:
  - 7
  - 14
  - 30
months: 6
month_options:
  - 3
  - 6
  - 12
max: 8
month_max: 240
unit: kWh
decimals: 2
height: 240
```

### Enabling modes

Modes are enabled by the YAML groups that are present:

- Add `days` and/or `day_options` to enable **Days**.
- Add `months` and/or `month_options` to enable **Months**.
- Add both groups to show the **Days / Months** switch.
- If a mode has only one configured range, its range buttons are hidden.
- A minimal legacy configuration with neither group remains daily-only.
- Browser-saved selections are restored only while the corresponding YAML default and options stay unchanged; editing `days`, `months`, or their option lists takes effect immediately.

`max` is the top of the active mode's gradient scale. For a monthly-only
card, `max: 107` means that 107 kWh reaches 100% and reveals the red top of
the gradient. When both modes are enabled, set `month_max` only if the monthly
scale should differ from the daily `max`.

Monthly-only example:

```yaml
type: custom:daily-energy-gradient-card
entity: sensor.boiler_energy
name: Boiler consumption by month
months: 12
month_options:
  - 6
  - 12
month_max: 240
unit: kWh
```

## Bubble Card pop-up example

```yaml
type: custom:bubble-card
card_type: pop-up
hash: "#boiler-energy"
popup_mode: centered
width_desktop: 620px
full_width_on_mobile: true
name: Boiler consumption
icon: mdi:chart-bar
cards:
  - type: custom:daily-energy-gradient-card
    entity: sensor.boiler_energy
    name: Boiler energy consumption
    mode: daily
    days: 7
    day_options:
      - 7
      - 14
      - 30
    months: 6
    month_options:
      - 3
      - 6
      - 12
    max: 8
    month_max: 240
    unit: kWh
    decimals: 2
    height: 240
```

Open it from another card with:

```yaml
tap_action:
  action: navigate
  navigation_path: "#boiler-energy"
```

## Configuration

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `entity` | Yes | — | Continuous cumulative energy sensor. |
| `name` | No | `Расход энергии` | Card title. |
| `mode` | No | first enabled mode | Initially selected mode: `daily` or `monthly`. The user's choice is saved in the browser. |
| `days` | No | `7` | Initially selected range; its presence enables daily mode. |
| `day_options` | No | selected `days` value | Selectable ranges; its presence enables daily mode. |
| `months` | No | `6` | Initially selected number of months; its presence enables monthly mode. |
| `month_options` | No | selected `months` value | Selectable monthly ranges; its presence enables monthly mode. |
| `max` | No | `8` | Top of the fixed color scale for the active mode. |
| `month_max` | No | same as `max` | Optional separate top of the monthly color scale. |
| `unit` | No | `кВт⋅ч` | Displayed unit. |
| `decimals` | No | `2` | Decimal places. |
| `height` | No | `190` | Chart height in pixels. |

## License

MIT
