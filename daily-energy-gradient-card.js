class DailyEnergyGradientCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = [];
    this._loading = false;
    this._lastLoad = 0;
  }

  _readPreference(key, configuredValue, allowedValues, signature) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (
        saved?.version === 1
        && saved.configured === configuredValue
        && saved.signature === signature
        && allowedValues.includes(saved.value)
      ) {
        return saved.value;
      }
    } catch (_error) {
      // Старые значения или закрытый localStorage игнорируются.
    }
    return configuredValue;
  }

  _writePreference(key, value, configuredValue, signature) {
    try {
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        value,
        configured: configuredValue,
        signature,
      }));
    } catch (_error) {
      // Карточка продолжит работать без сохранения выбора.
    }
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Укажите entity");
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
    const hasDailyConfig = hasOwn("days") || hasOwn("day_options");
    const hasMonthlyConfig = hasOwn("months") || hasOwn("month_options");

    // Backward compatibility: a minimal configuration without either group
    // remains a daily card. Otherwise a mode exists only when its YAML group
    // is explicitly present.
    this._availableModes = [];
    if (hasDailyConfig || (!hasDailyConfig && !hasMonthlyConfig)) {
      this._availableModes.push("daily");
    }
    if (hasMonthlyConfig) this._availableModes.push("monthly");

    this.config = {
      name: "Расход энергии",
      mode: "daily",
      days: 7,
      day_options: [7, 14, 30],
      months: 6,
      month_options: [3, 6, 12],
      max: 8,
      month_max: null,
      unit: "кВт⋅ч",
      decimals: 2,
      height: 190,
      ...config,
    };
    const configuredDays = Math.max(1, Number(this.config.days) || 7);
    const configuredMonths = Math.max(1, Number(this.config.months) || 6);
    const defaultDayOptions = hasOwn("day_options")
      ? this.config.day_options
      : (hasOwn("days") ? [configuredDays] : [7, 14, 30]);
    const defaultMonthOptions = hasOwn("month_options")
      ? this.config.month_options
      : (hasOwn("months") ? [configuredMonths] : [3, 6, 12]);
    this.config.day_options = [...new Set(
      (Array.isArray(defaultDayOptions) ? defaultDayOptions : [configuredDays])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0),
    )].sort((a, b) => a - b);
    if (!this.config.day_options.length) this.config.day_options = [configuredDays];
    this.config.month_options = [...new Set(
      (Array.isArray(defaultMonthOptions) ? defaultMonthOptions : [configuredMonths])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0),
    )].sort((a, b) => a - b);
    if (!this.config.month_options.length) this.config.month_options = [configuredMonths];
    if (!this.config.day_options.includes(configuredDays)) {
      this.config.day_options.push(configuredDays);
      this.config.day_options.sort((a, b) => a - b);
    }
    if (!this.config.month_options.includes(configuredMonths)) {
      this.config.month_options.push(configuredMonths);
      this.config.month_options.sort((a, b) => a - b);
    }

    const configuredMode = this._availableModes.includes(this.config.mode)
      ? this.config.mode
      : this._availableModes[0];
    const modeSignature = this._availableModes.join(",");
    this.config.mode = this._readPreference(
      `daily-energy-gradient-card:${this.config.entity}:mode`,
      configuredMode,
      this._availableModes,
      modeSignature,
    );

    const daySignature = this.config.day_options.join(",");
    this.config.days = this._readPreference(
      `daily-energy-gradient-card:${this.config.entity}:days`,
      configuredDays,
      this.config.day_options,
      daySignature,
    );
    const monthSignature = this.config.month_options.join(",");
    this.config.months = this._readPreference(
      `daily-energy-gradient-card:${this.config.entity}:months`,
      configuredMonths,
      this.config.month_options,
      monthSignature,
    );
    this._preferenceDefaults = {
      mode: configuredMode,
      days: configuredDays,
      months: configuredMonths,
    };
    this._preferenceSignatures = {
      mode: modeSignature,
      days: this.config.day_options.join(","),
      months: this.config.month_options.join(","),
    };
    this._restoreCache();
    this._lastLoad = 0;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const now = Date.now();
    if (!this._loading && now - this._lastLoad > 5 * 60 * 1000) {
      this._loadHistory();
    }
  }

  getCardSize() {
    return 4;
  }

  _dayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  _monthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  _days() {
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = this.config.days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      result.push({
        key: this._dayKey(date),
        label: new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
          .format(date)
          .replace(".", ""),
        date,
        values: [],
      });
    }
    return result;
  }

  _months() {
    const result = [];
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    for (let offset = this.config.months - 1; offset >= 0; offset -= 1) {
      const date = new Date(currentMonth);
      date.setMonth(currentMonth.getMonth() - offset);
      const month = new Intl.DateTimeFormat("ru-RU", { month: "short" })
        .format(date)
        .replace(".", "");
      result.push({
        key: this._monthKey(date),
        label: `${month} ${String(date.getFullYear()).slice(-2)}`,
        date,
        values: [],
      });
    }
    return result;
  }

  _periods() {
    return this.config.mode === "monthly" ? this._months() : this._days();
  }

  _rangeValue() {
    return this.config.mode === "monthly" ? this.config.months : this.config.days;
  }

  _rangeOptions() {
    return this.config.mode === "monthly"
      ? this.config.month_options
      : this.config.day_options;
  }

  _cacheKey() {
    return `daily-energy-gradient-card:data:${this.config.entity}:${this.config.mode}:${this._rangeValue()}`;
  }

  _restoreCache() {
    this._data = [];
    try {
      const cached = JSON.parse(localStorage.getItem(this._cacheKey()) || "null");
      if (!cached?.timestamp || Date.now() - cached.timestamp > 24 * 60 * 60 * 1000) return;
      const values = new Map(
        (Array.isArray(cached.data) ? cached.data : [])
          .filter((item) => item?.key && Number.isFinite(Number(item.value)))
          .map((item) => [item.key, Number(item.value)]),
      );
      this._data = this._periods().map((day) => ({
        ...day,
        value: values.get(day.key) ?? 0,
      }));
    } catch (_error) {
      this._data = [];
    }
  }

  _saveCache() {
    try {
      localStorage.setItem(this._cacheKey(), JSON.stringify({
        timestamp: Date.now(),
        data: this._data.map((day) => ({ key: day.key, value: day.value })),
      }));
    } catch (_error) {
      // Без localStorage карточка просто загружается обычным способом.
    }
  }

  async _loadMonthlyStatistics() {
    const months = this._months();
    const start = new Date(months[0].date);
    start.setDate(start.getDate() - 2);
    const end = new Date();
    const statistics = await this._hass.callWS({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: [this.config.entity],
      period: "day",
      types: ["sum"],
    });
    const rows = (statistics?.[this.config.entity] || [])
      .map((row) => {
        const rawTime = row.start;
        const time = typeof rawTime === "number"
          ? (rawTime < 1e12 ? rawTime * 1000 : rawTime)
          : new Date(rawTime).getTime();
        return { time, sum: Number(row.sum) };
      })
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.sum))
      .sort((a, b) => a.time - b.time);

    if (rows.length < 2) {
      throw new Error("Для месячного режима недостаточно долгосрочной статистики sum");
    }

    const values = new Map(months.map((month) => [month.key, 0]));
    for (let index = 1; index < rows.length; index += 1) {
      const value = rows[index].sum - rows[index - 1].sum;
      const key = this._monthKey(new Date(rows[index].time));
      if (values.has(key) && Number.isFinite(value) && value >= 0) {
        values.set(key, values.get(key) + value);
      }
    }

    this._data = months.map((month) => ({
      ...month,
      value: Math.max(0, values.get(month.key) || 0),
    }));
    this._saveCache();
    this._error = "";
    this._lastLoad = Date.now();
  }

  async _loadHistory() {
    if (!this._hass || !this.config) return;
    this._loading = true;
    this._render();

    try {
      if (this.config.mode === "monthly") {
        await this._loadMonthlyStatistics();
        return;
      }
      const days = this._days();
      const start = new Date(days[0].date);
      const historyStart = new Date(start);
      historyStart.setDate(historyStart.getDate() - 1);
      const end = new Date();
      const entity = encodeURIComponent(this.config.entity);
      const path = `history/period/${encodeURIComponent(historyStart.toISOString())}`
        + `?filter_entity_id=${entity}`
        + `&end_time=${encodeURIComponent(end.toISOString())}`
        + "&no_attributes=true";

      // Оба источника загружаются одновременно. Кэш уже показан на экране,
      // поэтому обновление происходит незаметно в фоне.
      const [historyResult, statisticsResult] = await Promise.allSettled([
        this._hass.callApi("GET", path),
        this._hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: historyStart.toISOString(),
          end_time: end.toISOString(),
          statistic_ids: [this.config.entity],
          period: "day",
          types: ["sum"],
        }),
      ]);
      if (historyResult.status === "rejected" && statisticsResult.status === "rejected") {
        throw historyResult.reason || statisticsResult.reason || new Error("История недоступна");
      }

      const response = historyResult.status === "fulfilled" ? historyResult.value : [];
      const states = Array.isArray(response?.[0]) ? response[0] : [];
      const points = states
        .map((item) => {
          const value = Number(item.state);
          const stamp = item.last_updated || item.last_changed;
          const time = stamp ? new Date(stamp).getTime() : NaN;
          return { value, time };
        })
        .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time));

      const currentValue = Number(this._hass.states?.[this.config.entity]?.state);
      if (Number.isFinite(currentValue)) {
        points.push({ value: currentValue, time: end.getTime() });
      }
      points.sort((a, b) => a.time - b.time);

      const historyData = days.map((day) => {
        const dayStart = day.date.getTime();
        const nextDay = new Date(day.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const dayEnd = Math.min(nextDay.getTime(), end.getTime());

        let segmentStart = null;
        let previous = null;
        let completedSegments = 0;

        for (const point of points) {
          if (point.time <= dayStart) {
            previous = point.value;
            segmentStart = point.value;
            continue;
          }
          if (point.time > dayEnd) break;

          if (previous === null) {
            previous = point.value;
            segmentStart = point.value;
            continue;
          }

          if (point.value < previous) {
            // Сбросом считаем только падение почти к нулю. Небольшое снижение
            // — это коррекция показания, и его нельзя прибавлять как новый
            // цикл: именно это раньше давало двойные значения вроде 11,26.
            const resetLimit = Math.max(0.1, previous * 0.2);
            if (point.value <= resetLimit) {
              completedSegments += Math.max(0, previous - segmentStart);
              segmentStart = point.value;
            }
          }
          previous = point.value;
        }

        const value = previous !== null && segmentStart !== null
          ? completedSegments + Math.max(0, previous - segmentStart)
          : 0;
        return { ...day, value: Math.max(0, value) };
      });

      // Recorder обычно хранит подробную историю меньше, чем долгосрочную
      // статистику. Для старых дней берём разницу соседних значений `sum`.
      // В отличие от `change`, это не удваивает расход при коррекции датчика.
      const statisticValues = new Map();
      try {
        const statistics = statisticsResult.status === "fulfilled"
          ? statisticsResult.value
          : {};
        const rows = (statistics?.[this.config.entity] || [])
          .map((row) => {
            const rawTime = row.start;
            const time = typeof rawTime === "number"
              ? (rawTime < 1e12 ? rawTime * 1000 : rawTime)
              : new Date(rawTime).getTime();
            return { time, sum: Number(row.sum) };
          })
          .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.sum))
          .sort((a, b) => a.time - b.time);

        for (let index = 1; index < rows.length; index += 1) {
          const value = rows[index].sum - rows[index - 1].sum;
          if (Number.isFinite(value) && value >= 0) {
            statisticValues.set(
              this._dayKey(new Date(rows[index].time)),
              value,
            );
          }
        }
      } catch (_error) {
        // Если статистики нет, остаются доступные значения Recorder.
      }

      const todayKey = days[days.length - 1]?.key;
      this._data = historyData.map((day) => {
        // Так же, как панель «Энергия»: для каждого завершённого дня берём
        // прирост накопительной долгосрочной статистики sum. Сырая история
        // используется только сегодня либо когда статистика недоступна.
        if (
          day.key !== todayKey
          && statisticValues.has(day.key)
        ) {
          return { ...day, value: statisticValues.get(day.key) };
        }
        return day;
      });
      this._saveCache();
      this._error = "";
      this._lastLoad = Date.now();
    } catch (error) {
      this._error = error?.message || String(error);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot || !this.config) return;

    const dailyMax = Math.max(Number(this.config.max) || 8, 0.01);
    const configuredMonthMax = Number(this.config.month_max);
    const max = this.config.mode === "monthly" && configuredMonthMax > 0
      ? configuredMonthMax
      : dailyMax;
    const decimals = Math.max(0, Number(this.config.decimals) || 0);
    const data = this._data.length ? this._data : this._periods().map((d) => ({ ...d, value: 0 }));
    const currentValue = data[data.length - 1]?.value || 0;
    const chartMinWidth = Math.max(0, data.length * (this.config.mode === "monthly" ? 66 : 54));

    const modeLabels = { daily: "Дни", monthly: "Месяцы" };
    const modeButtons = this._availableModes.length > 1
      ? this._availableModes.map((mode) => `
        <button class="mode-button${this.config.mode === mode ? " active" : ""}"
          data-mode="${mode}" type="button">${modeLabels[mode]}</button>
      `).join("")
      : "";

    const activeRange = this._rangeValue();
    const rangeSuffix = this.config.mode === "monthly" ? "мес." : "дн.";
    const rangeButtons = this._rangeOptions().length > 1
      ? this._rangeOptions().map((range) => `
      <button class="range-button${range === activeRange ? " active" : ""}"
        data-range="${range}" type="button">${range} ${rangeSuffix}</button>
      `).join("")
      : "";
    const controls = modeButtons || rangeButtons
      ? `<div class="controls">
          ${modeButtons ? `<div class="modes">${modeButtons}</div>` : ""}
          ${rangeButtons ? `<div class="ranges">${rangeButtons}</div>` : ""}
        </div>`
      : "";

    const bars = data.map((day) => {
      const pct = Math.min(Math.max((day.value / max) * 100, 0), 100);
      const bgScale = pct > 0 ? 10000 / pct : 100;
      const value = day.value.toFixed(decimals).replace(".", ",");
      return `
        <div class="day">
          <div class="value">${value}</div>
          <div class="track">
            <div class="fill" style="height:${pct}%;background-size:100% ${bgScale}%;"></div>
          </div>
          <div class="label">${day.label}</div>
        </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --energy-gradient: linear-gradient(
            to top,
            #30d158 0%,
            #78e63d 32%,
            #ffd60a 58%,
            #ff9f0a 78%,
            #ff453a 100%
          );
          display: block;
        }
        ha-card {
          padding: 18px 18px 14px;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(128, 128, 128, 0.14);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.10);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        }
        .header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .ranges {
          display: flex;
          gap: 6px;
          margin: -6px 0 14px;
        }
        .controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px 12px;
          margin: -6px 0 14px;
        }
        .modes, .controls .ranges {
          display: flex;
          gap: 6px;
          margin: 0;
        }
        .mode-button,
        .range-button {
          appearance: none;
          border: 0;
          border-radius: 999px;
          padding: 6px 11px;
          background: rgba(128, 128, 128, 0.12);
          color: var(--secondary-text-color);
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .mode-button.active,
        .range-button.active {
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        .chart-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
        }
        .title { font-size: 17px; font-weight: 650; }
        .today { font-size: 24px; font-weight: 750; line-height: 1; }
        .unit { margin-left: 4px; font-size: 12px; color: var(--secondary-text-color); }
        .chart {
          height: ${Number(this.config.height) || 190}px;
          min-width: ${chartMinWidth}px;
          display: grid;
          grid-template-columns: repeat(${data.length}, minmax(0, 1fr));
          gap: 10px;
          align-items: stretch;
        }
        .day { position: relative; min-width: 0; padding-top: 27px; }
        .track {
          position: absolute;
          inset: 27px 0 29px;
          overflow: hidden;
          border-radius: 11px;
          background: rgba(128, 128, 128, 0.055);
        }
        .fill {
          position: absolute;
          z-index: 1;
          left: 0;
          right: 0;
          bottom: 0;
          min-height: 0;
          border-radius: 11px;
          background-image: var(--energy-gradient);
          background-position: bottom;
          background-repeat: no-repeat;
          box-shadow: 0 4px 12px rgba(48, 209, 88, 0.18);
        }
        .value {
          position: absolute;
          z-index: 2;
          top: 3px;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          font-size: 13px;
          font-weight: 750;
          line-height: 1;
        }
        .label {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          text-align: center;
          color: var(--secondary-text-color);
          font-size: 14px;
          font-weight: 750;
          text-transform: capitalize;
        }
        .status {
          margin-top: 8px;
          color: var(--secondary-text-color);
          font-size: 11px;
        }
        .error { color: var(--error-color, #ff453a); }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${this.config.name}</div>
          <div><span class="today">${currentValue.toFixed(decimals).replace(".", ",")}</span><span class="unit">${this.config.unit}</span></div>
        </div>
        ${controls}
        <div class="chart-scroll"><div class="chart">${bars}</div></div>
        ${this._loading && !this._data.length ? '<div class="status">Обновление истории…</div>' : ''}
        ${this._error ? `<div class="status error">${this._error}</div>` : ''}
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".range-button").forEach((button) => {
      button.addEventListener("click", () => {
        const range = Number(button.dataset.range);
        if (!Number.isInteger(range) || range <= 0 || range === this._rangeValue()) return;
        const field = this.config.mode === "monthly" ? "months" : "days";
        this.config[field] = range;
        this._writePreference(
          `daily-energy-gradient-card:${this.config.entity}:${field}`,
          range,
          this._preferenceDefaults[field],
          this._preferenceSignatures[field],
        );
        this._restoreCache();
        this._lastLoad = 0;
        this._loadHistory();
      });
    });

    this.shadowRoot.querySelectorAll(".mode-button").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (!this._availableModes.includes(mode) || mode === this.config.mode) return;
        this.config.mode = mode;
        this._writePreference(
          `daily-energy-gradient-card:${this.config.entity}:mode`,
          mode,
          this._preferenceDefaults.mode,
          this._preferenceSignatures.mode,
        );
        this._restoreCache();
        this._lastLoad = 0;
        this._loadHistory();
      });
    });

    // При первом открытии и после смены периода показываем последние дни.
    const scroll = this.shadowRoot.querySelector(".chart-scroll");
    if (scroll) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scroll.scrollLeft = scroll.scrollWidth;
        });
      });
    }
  }
}

if (!customElements.get("daily-energy-gradient-card")) {
  customElements.define("daily-energy-gradient-card", DailyEnergyGradientCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "daily-energy-gradient-card",
  name: "Daily Energy Gradient Card",
  description: "Расход энергии по дням или месяцам на фиксированной зелёно-красной шкале",
  preview: false,
});
