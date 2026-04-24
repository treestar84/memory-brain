export interface Clock {
  now(): Date;
  isoNow(): string;
  isoDate(): string;
}

export class RealClock implements Clock {
  now(): Date { return new Date(); }
  isoNow(): string { return new Date().toISOString(); }
  isoDate(): string { return new Date().toISOString().slice(0, 10); }
}

export class FakeClock implements Clock {
  constructor(private current: Date = new Date("2026-04-17T10:00:00+09:00")) {}
  now(): Date { return new Date(this.current); }
  isoNow(): string { return this.current.toISOString(); }
  isoDate(): string { return this.current.toISOString().slice(0, 10); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
  set(date: Date | string): void { this.current = typeof date === "string" ? new Date(date) : date; }
}
