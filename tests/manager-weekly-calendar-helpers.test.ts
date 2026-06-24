import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCapacityDots } from "@/components/calendar/manager-weekly-calendar/capacity-dots";
import {
  buildDateHref,
  formatPersianNumber,
  formatPersianShortHour,
  formatPersianShortHourRange,
} from "@/components/calendar/manager-weekly-calendar/formatting";
import {
  buildMobileSlotAriaLabel,
  getMobileSlotStatusLabel,
} from "@/components/calendar/manager-weekly-calendar/mobile-slot-helpers";
import {
  getFocusedDayWidth,
  getPositionedReservationBlocks,
  needsFocusedDayExpansion,
} from "@/components/calendar/manager-weekly-calendar/reservation-block-helpers";
import type {
  ManagerWeekDay,
  ManagerWeekSlot,
  SlotReservationDetail,
} from "@/components/calendar/manager-weekly-calendar/types";

function createDetail(
  id: string,
  status: SlotReservationDetail["status"] = "APPROVED",
): SlotReservationDetail {
  return {
    id,
    partySize: 1,
    reason: null,
    status,
    userName: `User ${id}`,
  };
}

function createSlot(input: Partial<ManagerWeekSlot> & Pick<ManagerWeekSlot, "slotStartHour" | "slotEndHour">): ManagerWeekSlot {
  return {
    approvedCount: 0,
    capacity: 0,
    details: [],
    pendingCount: 0,
    ...input,
  };
}

function createDay(slots: ManagerWeekSlot[]): ManagerWeekDay {
  return {
    closedReason: null,
    dateLabel: "پنج شنبه ۳۱ اردیبهشت ۱۴۰۵",
    dateParam: "1405-02-31",
    shortLabel: "پنج شنبه",
    slots,
  };
}

test("formatPersianShortHour pads hours with Persian digits", () => {
  assert.equal(formatPersianShortHour(8), "۰۸");
  assert.equal(formatPersianShortHour(13), "۱۳");
});

test("formatPersianShortHourRange renders a compact Persian hour range", () => {
  assert.equal(formatPersianShortHourRange(8, 10), "۰۸–۱۰");
});

test("formatPersianNumber renders Persian digits without grouping", () => {
  assert.equal(formatPersianNumber(0), "۰");
  assert.equal(formatPersianNumber(1234), "۱۲۳۴");
});

test("buildDateHref keeps the date param in the expected query format", () => {
  assert.equal(buildDateHref("1405-02-31"), "?date=1405-02-31");
});

test("buildCapacityDots returns approved and free dots with bounded counts", () => {
  assert.deepEqual(buildCapacityDots(createSlot({
    approvedCount: 2,
    capacity: 5,
    slotEndHour: 10,
    slotStartHour: 9,
  })), ["free", "free", "free", "approved", "approved"]);
});

test("buildCapacityDots does not crash for zero or negative capacity", () => {
  assert.deepEqual(buildCapacityDots(createSlot({
    approvedCount: 3,
    capacity: 0,
    slotEndHour: 10,
    slotStartHour: 9,
  })), []);
  assert.deepEqual(buildCapacityDots(createSlot({
    approvedCount: 3,
    capacity: -2,
    slotEndHour: 10,
    slotStartHour: 9,
  })), []);
});

test("buildCapacityDots clamps approved count to capacity", () => {
  assert.deepEqual(buildCapacityDots(createSlot({
    approvedCount: 5,
    capacity: 2,
    slotEndHour: 10,
    slotStartHour: 9,
  })), ["approved", "approved"]);
});

test("non-overlapping reservations share a lane", () => {
  const alpha = createDetail("alpha");
  const beta = createDetail("beta");
  const day = createDay([
    createSlot({
      approvedCount: 1,
      capacity: 2,
      details: [alpha],
      slotEndHour: 10,
      slotStartHour: 9,
    }),
    createSlot({
      approvedCount: 0,
      capacity: 2,
      details: [],
      slotEndHour: 11,
      slotStartHour: 10,
    }),
    createSlot({
      approvedCount: 1,
      capacity: 2,
      details: [beta],
      slotEndHour: 12,
      slotStartHour: 11,
    }),
  ]);

  const blocks = getPositionedReservationBlocks(day);

  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((block) => ({
      endHour: block.endHour,
      id: block.detail.id,
      lane: block.lane,
      laneCount: block.laneCount,
      startHour: block.startHour,
    })),
    [
      { endHour: 10, id: "alpha", lane: 0, laneCount: 1, startHour: 9 },
      { endHour: 12, id: "beta", lane: 0, laneCount: 1, startHour: 11 },
    ],
  );
});

test("overlapping reservations are split across separate lanes with shared laneCount", () => {
  const alpha = createDetail("alpha");
  const beta = createDetail("beta");
  const day = createDay([
    createSlot({
      approvedCount: 2,
      capacity: 3,
      details: [alpha],
      slotEndHour: 10,
      slotStartHour: 9,
    }),
    createSlot({
      approvedCount: 2,
      capacity: 3,
      details: [alpha, beta],
      slotEndHour: 11,
      slotStartHour: 10,
    }),
    createSlot({
      approvedCount: 1,
      capacity: 3,
      details: [beta],
      slotEndHour: 12,
      slotStartHour: 11,
    }),
  ]);

  const blocks = getPositionedReservationBlocks(day);

  assert.deepEqual(
    blocks.map((block) => ({
      endHour: block.endHour,
      id: block.detail.id,
      lane: block.lane,
      laneCount: block.laneCount,
      startHour: block.startHour,
    })),
    [
      { endHour: 11, id: "alpha", lane: 0, laneCount: 2, startHour: 9 },
      { endHour: 12, id: "beta", lane: 1, laneCount: 2, startHour: 10 },
    ],
  );
});

test("focused day width grows with concurrent lanes and requester name length", () => {
  const blocks = [
    {
      detail: { ...createDetail("alpha"), userName: "علی رضایی" },
      endHour: 13,
      lane: 0,
      laneCount: 5,
      startHour: 9,
    },
  ];

  assert.equal(getFocusedDayWidth([]), 280);
  assert.equal(getFocusedDayWidth(blocks), 456);
});

test("focused day expands only when its names need more room", () => {
  const singleReadableBlock = {
    detail: { ...createDetail("alpha"), userName: "علی رضایی" },
    endHour: 13,
    lane: 0,
    laneCount: 1,
    startHour: 9,
  };
  const singleLongNameBlock = {
    ...singleReadableBlock,
    detail: {
      ...singleReadableBlock.detail,
      userName: "امیرحسین عبدالهی‌زاده",
    },
  };

  assert.equal(needsFocusedDayExpansion([]), false);
  assert.equal(needsFocusedDayExpansion([singleReadableBlock]), false);
  assert.equal(needsFocusedDayExpansion([singleLongNameBlock]), true);
  assert.equal(
    needsFocusedDayExpansion([
      { ...singleReadableBlock, laneCount: 2 },
      { ...singleReadableBlock, lane: 1, laneCount: 2 },
    ]),
    true,
  );
});

test("focused day width is capped for unusually busy days", () => {
  const blocks = [
    {
      detail: {
        ...createDetail("alpha"),
        userName: "نام بسیار طولانی درخواست کننده برای آزمایش",
      },
      endHour: 13,
      lane: 0,
      laneCount: 20,
      startHour: 9,
    },
  ];

  assert.equal(getFocusedDayWidth(blocks), 720);
});

test("multi-hour reservation blocks preserve their start and end hours", () => {
  const alpha = createDetail("alpha");
  const day = createDay([
    createSlot({
      approvedCount: 1,
      capacity: 2,
      details: [alpha],
      slotEndHour: 10,
      slotStartHour: 9,
    }),
    createSlot({
      approvedCount: 1,
      capacity: 2,
      details: [alpha],
      slotEndHour: 11,
      slotStartHour: 10,
    }),
    createSlot({
      approvedCount: 1,
      capacity: 2,
      details: [alpha],
      slotEndHour: 12,
      slotStartHour: 11,
    }),
  ]);

  const [block] = getPositionedReservationBlocks(day);

  assert.ok(block);
  assert.equal(block.startHour, 9);
  assert.equal(block.endHour, 12);
  assert.equal(block.lane, 0);
  assert.equal(block.laneCount, 1);
});

test("mobile slot status label shows full capacity when approved count reaches capacity", () => {
  assert.equal(
    getMobileSlotStatusLabel(createSlot({
      approvedCount: 3,
      capacity: 3,
      slotEndHour: 10,
      slotStartHour: 9,
    })),
    "ظرفیت تکمیل است",
  );
});

test("mobile slot status label shows free capacity with Persian digits", () => {
  assert.equal(
    getMobileSlotStatusLabel(createSlot({
      approvedCount: 2,
      capacity: 5,
      slotEndHour: 10,
      slotStartHour: 9,
    })),
    "۳ ظرفیت آزاد",
  );
});

test("mobile slot aria label includes date, time range, counts, and free capacity", () => {
  const day = createDay([]);
  const label = buildMobileSlotAriaLabel(day, createSlot({
    approvedCount: 2,
    capacity: 5,
    pendingCount: 1,
    slotEndHour: 10,
    slotStartHour: 9,
  }));

  assert.equal(
    label,
    "پنج شنبه ۳۱ اردیبهشت ۱۴۰۵، ساعت ۰۹–۱۰، ۲ رزرو تاییدشده، ۱ درخواست در انتظار، ۳ ظرفیت آزاد",
  );
});
