// Tes aturan alur kerja bersama (dipakai server dan UI).
// Jalankan: node --test tests/*.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUS_ORDER,
  ALLOWED_TRANSITIONS,
  canTransition,
  CATEGORY_TO_DEPARTMENT,
} from '../src/lib/workflow.ts';
import { CATEGORIES, DEPARTMENTS } from '../src/lib/types.ts';

test('STATUS_ORDER berisi urutan alur kerja baru -> diproses -> selesai', () => {
  assert.deepEqual(STATUS_ORDER, ['baru', 'diproses', 'selesai']);
});

test('canTransition mengizinkan baru -> diproses', () => {
  assert.equal(canTransition('baru', 'diproses'), true);
});

test('canTransition mengizinkan diproses -> selesai', () => {
  assert.equal(canTransition('diproses', 'selesai'), true);
});

test('canTransition menolak lompatan baru -> selesai', () => {
  assert.equal(canTransition('baru', 'selesai'), false);
});

test('canTransition menolak selesai -> baru', () => {
  assert.equal(canTransition('selesai', 'baru'), false);
});

test('canTransition menolak status ke dirinya sendiri (baru -> baru)', () => {
  assert.equal(canTransition('baru', 'baru'), false);
  assert.equal(canTransition('diproses', 'diproses'), false);
  assert.equal(canTransition('selesai', 'selesai'), false);
});

test('ALLOWED_TRANSITIONS tidak membuka transisi dari selesai', () => {
  assert.deepEqual([...ALLOWED_TRANSITIONS.selesai], []);
  assert.deepEqual([...ALLOWED_TRANSITIONS.baru], ['diproses']);
  assert.deepEqual([...ALLOWED_TRANSITIONS.diproses], ['selesai']);
});

test('CATEGORY_TO_DEPARTMENT lengkap untuk 5 kategori dan memakai departemen valid', () => {
  assert.equal(CATEGORIES.length, 5);
  assert.deepEqual(Object.keys(CATEGORY_TO_DEPARTMENT).sort(), [...CATEGORIES].sort());

  for (const category of CATEGORIES) {
    const department = CATEGORY_TO_DEPARTMENT[category];
    assert.ok(
      DEPARTMENTS.includes(department),
      `departemen ${department} untuk kategori ${category} tidak valid`
    );
  }
});
