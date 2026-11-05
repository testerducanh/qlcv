const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(ALPHABET.length);
const POSITION_LENGTH = 12;
const MAX_VALUE = BASE ** BigInt(POSITION_LENGTH) - 1n;
const STEP = BASE ** 6n;

export class PositionSpaceExhaustedError extends Error {
  constructor() {
    super("Không còn khoảng trống giữa các vị trí, cần sắp xếp lại");
  }
}

function decode(position: string): bigint {
  if (!new RegExp(`^[0-9A-Z]{${POSITION_LENGTH}}$`).test(position)) {
    throw new RangeError("Chỉ mục vị trí không hợp lệ");
  }
  let value = 0n;
  for (const character of position) {
    value = value * BASE + BigInt(ALPHABET.indexOf(character));
  }
  return value;
}

function encode(value: bigint): string {
  if (value < 0n || value > MAX_VALUE) {
    throw new RangeError("Chỉ mục vị trí vượt giới hạn");
  }
  let remainder = value;
  let result = "";
  for (let index = 0; index < POSITION_LENGTH; index += 1) {
    result = ALPHABET[Number(remainder % BASE)] + result;
    remainder /= BASE;
  }
  return result;
}

export function positionBetween(
  before: string | null,
  after: string | null,
): string {
  const lower = before === null ? 0n : decode(before);
  const upper = after === null ? MAX_VALUE : decode(after);
  if (upper <= lower || upper - lower <= 1n) {
    throw new PositionSpaceExhaustedError();
  }
  return encode(lower + (upper - lower) / 2n);
}

export function positionAt(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Chỉ mục vị trí phải là số nguyên không âm");
  }
  return encode(STEP * BigInt(index + 1));
}
