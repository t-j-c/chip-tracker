/** A position on the table stage, in percent of its width (x) and height (y). */
export interface Point {
  x: number;
  y: number;
}

export const SEAT_RX = 38;
export const SEAT_RY = 40;
export const BET_RX = 21;
export const BET_RY = 22;
export const POT_POINT: Point = { x: 50, y: 60 };
export const HERO_SEAT_POINT: Point = { x: 50, y: 100 };

const round = (n: number) => Math.round(n * 100) / 100;

function pointOnEllipse(angleDeg: number, rx: number, ry: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: round(50 + rx * Math.cos(rad)), y: round(50 + ry * Math.sin(rad)) };
}

export function seatAngle(index: number, total: number): number {
  return 90 + (index * 360) / total;
}

export interface SeatSpot {
  seat: Point;
  bet: Point;
}

export function opponentLayout(opponentCount: number): SeatSpot[] {
  const total = opponentCount + 1;
  return Array.from({ length: opponentCount }, (_, i) => {
    const angle = seatAngle(i + 1, total);
    return { seat: pointOnEllipse(angle, SEAT_RX, SEAT_RY), bet: pointOnEllipse(angle, BET_RX, BET_RY) };
  });
}

export const HERO_BET_POINT: Point = pointOnEllipse(90, BET_RX, BET_RY);
