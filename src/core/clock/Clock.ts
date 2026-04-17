export interface Clock {
  now(): Date;
  isoNow(): string;
}

export class RealClock implements Clock {
  now(): Date { return new Date(); }
  isoNow(): string { return new Date().toISOString(); }
}

export class FakeClock implements Clock {
  constructor(private current: Date = new Date("2026-04-17T10:00:00+09:00")) {}
  now(): Date { return new Date(this.current); }
  isoNow(): string { return this.current.toISOString(); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
  set(date: Date | string): void { this.current = typeof date === "string" ? new Date(date) : date; }
}
