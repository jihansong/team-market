// Sakata's Five Methods detector
// Input: candles = [{date, open, high, low, close}, ...] sorted ascending by date.
// Each detector returns an array of detection events: {index, date, direction, info}.

const Sakata = (() => {

  function isBullCandle(c) { return c.close > c.open; }
  function isBearCandle(c) { return c.close < c.open; }
  function bodySize(c) { return Math.abs(c.close - c.open); }
  function range(c) { return c.high - c.low; }
  function avgRange(candles, i, n) {
    let s = 0, k = 0;
    for (let j = Math.max(0, i - n); j < i; j++) { s += range(candles[j]); k++; }
    return k ? s / k : 0;
  }

  // 三空 — three consecutive gaps in same direction.
  // gap_up:   today.low  > yesterday.high
  // gap_down: today.high < yesterday.low
  function detectSamgong(candles) {
    const events = [];
    for (let i = 3; i < candles.length; i++) {
      let upGaps = 0, downGaps = 0;
      for (let k = 0; k < 3; k++) {
        const cur = candles[i - k], prev = candles[i - k - 1];
        if (cur.low > prev.high) upGaps++;
        else if (cur.high < prev.low) downGaps++;
      }
      if (upGaps === 3) {
        events.push({ index: i, date: candles[i].date, direction: 'up',
          info: '상승 三空 (매수 클라이맥스)' });
      } else if (downGaps === 3) {
        events.push({ index: i, date: candles[i].date, direction: 'down',
          info: '하락 三空 (패닉 셀링)' });
      }
    }
    return events;
  }

  // 三兵 — three consecutive same-direction candles with progressive closes.
  // Body must be meaningful (>= 30% of recent average range).
  function detectSambyeong(candles) {
    const events = [];
    for (let i = 2; i < candles.length; i++) {
      const c0 = candles[i - 2], c1 = candles[i - 1], c2 = candles[i];
      const ar = avgRange(candles, i, 20);
      const bodyOK = (c) => bodySize(c) >= 0.3 * ar && ar > 0;
      if (isBullCandle(c0) && isBullCandle(c1) && isBullCandle(c2)
          && c2.close > c1.close && c1.close > c0.close
          && bodyOK(c0) && bodyOK(c1) && bodyOK(c2)) {
        events.push({ index: i, date: c2.date, direction: 'up',
          info: '적삼병 (赤三兵 — 강세 지속)' });
      } else if (isBearCandle(c0) && isBearCandle(c1) && isBearCandle(c2)
          && c2.close < c1.close && c1.close < c0.close
          && bodyOK(c0) && bodyOK(c1) && bodyOK(c2)) {
        events.push({ index: i, date: c2.date, direction: 'down',
          info: '흑삼병 (黑三兵 — 약세 지속)' });
      }
    }
    return events;
  }

  // Peak / trough detection with fractal window.
  function findPivots(candles, window = 5) {
    const highs = [], lows = [];
    for (let i = window; i < candles.length - window; i++) {
      let isHigh = true, isLow = true;
      for (let j = i - window; j <= i + window; j++) {
        if (j === i) continue;
        if (candles[j].high >= candles[i].high) isHigh = false;
        if (candles[j].low  <= candles[i].low)  isLow  = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high, date: candles[i].date });
      if (isLow)  lows.push({  index: i, price: candles[i].low,  date: candles[i].date });
    }
    return { highs, lows };
  }

  // 三山 — three peaks at similar levels within recent lookback.
  function detectSamsan(candles, lookback = 120, tol = 0.04) {
    const events = [];
    const start = Math.max(0, candles.length - lookback);
    const slice = candles.slice(start);
    const { highs } = findPivots(slice, 5);
    if (highs.length < 3) return events;
    for (let i = 2; i < highs.length; i++) {
      const a = highs[i - 2], b = highs[i - 1], c = highs[i];
      const maxP = Math.max(a.price, b.price, c.price);
      const minP = Math.min(a.price, b.price, c.price);
      if ((maxP - minP) / maxP <= tol) {
        events.push({
          index: start + c.index,
          date: c.date,
          direction: 'down',
          info: `三山 — 3개 고점 ${a.price.toFixed(0)}/${b.price.toFixed(0)}/${c.price.toFixed(0)}`,
          peaks: [a, b, c].map(p => ({ ...p, index: start + p.index })),
        });
      }
    }
    return events;
  }

  // 三川 — three troughs at similar levels within recent lookback.
  function detectSamcheon(candles, lookback = 120, tol = 0.04) {
    const events = [];
    const start = Math.max(0, candles.length - lookback);
    const slice = candles.slice(start);
    const { lows } = findPivots(slice, 5);
    if (lows.length < 3) return events;
    for (let i = 2; i < lows.length; i++) {
      const a = lows[i - 2], b = lows[i - 1], c = lows[i];
      const maxP = Math.max(a.price, b.price, c.price);
      const minP = Math.min(a.price, b.price, c.price);
      if ((maxP - minP) / minP <= tol) {
        events.push({
          index: start + c.index,
          date: c.date,
          direction: 'up',
          info: `三川 — 3개 저점 ${a.price.toFixed(0)}/${b.price.toFixed(0)}/${c.price.toFixed(0)}`,
          troughs: [a, b, c].map(p => ({ ...p, index: start + p.index })),
        });
      }
    }
    return events;
  }

  // 三法 — rising/falling three methods.
  // bullish: large bull → 3 small bear candles inside its range → bull breakout above first close.
  // bearish: mirror image.
  function detectSambeop(candles) {
    const events = [];
    for (let i = 4; i < candles.length; i++) {
      const big = candles[i - 4];
      const m1 = candles[i - 3], m2 = candles[i - 2], m3 = candles[i - 1];
      const last = candles[i];
      const ar = avgRange(candles, i - 4, 20);
      if (ar === 0) continue;
      const bigBody = bodySize(big);

      const inside = (c) => c.high <= big.high && c.low >= big.low;
      const smallish = (c) => bodySize(c) < bigBody;

      if (isBullCandle(big) && bigBody >= 0.8 * ar
          && isBearCandle(m1) && isBearCandle(m2) && isBearCandle(m3)
          && smallish(m1) && smallish(m2) && smallish(m3)
          && inside(m1) && inside(m2) && inside(m3)
          && isBullCandle(last) && last.close > big.close) {
        events.push({ index: i, date: last.date, direction: 'up',
          info: '상승 三法 (휴식 후 추세 재개)' });
      } else if (isBearCandle(big) && bigBody >= 0.8 * ar
          && isBullCandle(m1) && isBullCandle(m2) && isBullCandle(m3)
          && smallish(m1) && smallish(m2) && smallish(m3)
          && inside(m1) && inside(m2) && inside(m3)
          && isBearCandle(last) && last.close < big.close) {
        events.push({ index: i, date: last.date, direction: 'down',
          info: '하락 三法 (휴식 후 약세 재개)' });
      }
    }
    return events;
  }

  function detectAll(candles) {
    return {
      samsan:    detectSamsan(candles),
      samcheon:  detectSamcheon(candles),
      samgong:   detectSamgong(candles),
      sambyeong: detectSambyeong(candles),
      sambeop:   detectSambeop(candles),
    };
  }

  // Stage classification — looks at events near the last N bars.
  function classifyStage(candles, events, recencyBars = 5) {
    if (candles.length < 60) {
      return { stage: '데이터 부족', tone: 'neutral', note: '판단에 필요한 일봉 60개 미만.' };
    }
    const last = candles.length - 1;
    const recent = (arr) => arr.filter(e => e.index >= last - recencyBars);

    const r = {
      samsan:    recent(events.samsan),
      samcheon:  recent(events.samcheon),
      samgong:   recent(events.samgong),
      sambyeong: recent(events.sambyeong),
      sambeop:   recent(events.sambeop),
    };

    const last20 = candles[last].close / candles[Math.max(0, last - 20)].close - 1;
    const last60 = candles[last].close / candles[Math.max(0, last - 60)].close - 1;

    if (r.samgong.length) {
      const dir = r.samgong[r.samgong.length - 1].direction;
      return {
        stage: '추세 소진 임박',
        tone: 'warning',
        note: dir === 'up'
          ? '상승 三空 — 매수 클라이맥스 가능성, 단기 조정 대비.'
          : '하락 三空 — 패닉 셀링, 반등 가능 구간이나 추세 전환은 별도 확인 필요.',
      };
    }
    if (r.samsan.length) {
      return { stage: '약세 반전 시도', tone: 'bearish',
        note: '三山 — 3개 고점이 유사 가격대. 목선 이탈 시 추세 전환 확인.' };
    }
    if (r.samcheon.length) {
      return { stage: '강세 반전 시도', tone: 'bullish',
        note: '三川 — 3개 저점이 유사 가격대. 두 번째-세 번째 골 사이 고점 돌파 시 확인.' };
    }
    if (r.sambeop.length) {
      const dir = r.sambeop[r.sambeop.length - 1].direction;
      return {
        stage: dir === 'up' ? '상승 추세 재개' : '하락 추세 재개',
        tone: dir === 'up' ? 'bullish' : 'bearish',
        note: '三法 — 휴식 구간을 돌파봉이 마감. 같은 방향 추가 진입 가능.',
      };
    }
    if (r.sambyeong.length) {
      const dir = r.sambyeong[r.sambyeong.length - 1].direction;
      return {
        stage: dir === 'up' ? '강세 지속' : '약세 지속',
        tone: dir === 'up' ? 'bullish' : 'bearish',
        note: dir === 'up' ? '적삼병 — 양봉 3연속, 추세 가속 구간.'
                           : '흑삼병 — 음봉 3연속, 약세 지속.',
      };
    }
    if (Math.abs(last20) < 0.02 && Math.abs(last60) < 0.04) {
      return { stage: '횡보', tone: 'neutral', note: '뚜렷한 사카다 신호 없음 · 20/60일 변동폭 좁음.' };
    }
    return {
      stage: last20 > 0 ? '약상승' : '약하락',
      tone: last20 > 0 ? 'bullish' : 'bearish',
      note: '명시적 사카다 패턴은 없으나 추세 기울기는 존재.',
    };
  }

  // Technical levels: 60d high, 5d low avg (short neckline), Fib retracement on swing, MA60, MA120.
  function technicalLevels(candles) {
    const n = candles.length;
    const last = candles[n - 1].close;
    const lookback60 = candles.slice(Math.max(0, n - 60));
    const lookback120 = candles.slice(Math.max(0, n - 120));
    const high60 = Math.max(...lookback60.map(c => c.high));
    const low60  = Math.min(...lookback60.map(c => c.low));
    const last5lows = candles.slice(-5).map(c => c.low);
    const shortNeck = last5lows.reduce((a, b) => a + b, 0) / last5lows.length;
    const fib382 = high60 - (high60 - low60) * 0.382;
    const fib618 = high60 - (high60 - low60) * 0.618;
    const sma = (arr, k) => {
      if (arr.length < k) return null;
      return arr.slice(-k).reduce((a, c) => a + c.close, 0) / k;
    };
    const ma60  = sma(candles, 60);
    const ma120 = sma(candles, 120);

    return [
      { name: '돌파선 (60일 최고)',     value: high60,    style: 'solid',    color: '#3fb950',
        meaning: '이 가격 위로 마감 시 추세 강화 확인 (최근 60일 신고가).' },
      { name: '단기 목선 (5일 저점 평균)', value: shortNeck, style: 'dot-short', color: '#d29922',
        meaning: '이탈 시 흑삼병/하락 三空 시퀀스 시작 가능.' },
      { name: 'Fib 38.2% 되돌림',       value: fib382,    style: 'dot-mid',   color: '#d29922',
        meaning: '정상적 1차 되돌림 영역. 三山 무이께 후보.' },
      { name: '60일 이평선',            value: ma60,      style: 'dot-long',  color: '#f85149',
        meaning: '중기 추세선. 이탈 시 상승 추세 완전 종료.' },
      { name: 'Fib 61.8% 되돌림',       value: fib618,    style: 'dot-long',  color: '#f85149',
        meaning: '깊은 조정 영역. 三山 완성 측정 타깃.' },
      { name: '120일 이평선',           value: ma120,     style: 'dot-final', color: '#f85149',
        meaning: '장기 추세 마지노선. 이탈 시 약세장 진입.' },
    ].filter(x => x.value != null).map(x => ({
      ...x,
      diff: (x.value - last) / last,
    }));
  }

  return { detectAll, classifyStage, technicalLevels };
})();
