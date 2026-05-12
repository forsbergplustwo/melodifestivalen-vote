import { randomInt } from "crypto";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function normalizeRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(normalized)) return null;
  return normalized;
}

export function generateRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    code += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
  }
  return code;
}

