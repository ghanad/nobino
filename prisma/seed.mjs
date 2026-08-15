import { PrismaClient, UserRole } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");

  return `scrypt$${salt}$${key}`;
}

async function upsertUser({ email, name, role, password }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      active: true,
    },
    create: {
      email,
      name,
      role,
      active: true,
      passwordHash: hashPassword(password),
    },
  });
}

function paragraph(text) {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function heading(text) {
  return {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text }],
  };
}

function bulletList(items) {
  return {
    type: "bulletList",
    content: items.map((text) => ({
      type: "listItem",
      content: [paragraph(text)],
    })),
  };
}

function codeBlock(text) {
  return {
    type: "codeBlock",
    attrs: { language: null },
    content: [{ type: "text", text }],
  };
}

function wikiDocument(...content) {
  return { type: "doc", content };
}

async function upsertWikiPage({
  adminId,
  contentJson,
  contentText,
  parentId = null,
  slug,
  sortOrder,
  title,
}) {
  return prisma.wikiPage.upsert({
    where: { slug },
    update: {
      contentJson,
      contentText,
      isHidden: false,
      parentId,
      sortOrder,
      title,
      updatedById: adminId,
    },
    create: {
      contentJson,
      contentText,
      createdById: adminId,
      isHidden: false,
      parentId,
      slug,
      sortOrder,
      title,
      updatedById: adminId,
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: "admin@nobino.local",
    name: "Admin User",
    role: UserRole.ADMIN,
    password: "Admin123!",
  });

  await upsertUser({
    email: "manager@nobino.local",
    name: "Manager User",
    role: UserRole.MANAGER,
    password: "Manager123!",
  });

  await upsertUser({
    email: "user@nobino.local",
    name: "Normal User",
    role: UserRole.USER,
    password: "User123!",
  });

  await prisma.building.upsert({
    where: { id: "main-building" },
    update: {},
    create: { id: "main-building", active: true, name: "دفتر مرکزی", sortOrder: 1 },
  });

  await prisma.resourcePool.upsert({
    where: { id: "company-systems" },
    update: {
      name: "Company Systems",
      buildingId: "main-building",
      capacity: 5,
      active: true,
    },
    create: {
      id: "company-systems",
      buildingId: "main-building",
      name: "Company Systems",
      capacity: 5,
      active: true,
    },
  });

  await prisma.reservationPolicy.upsert({
    where: { id: "default" },
    update: {
      autoAcceptDelayHours: 4,
      autoAcceptEnabled: false,
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
    create: {
      id: "default",
      autoAcceptDelayHours: 4,
      autoAcceptEnabled: false,
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
  });

  const weeklySchedule = [
    { dayOfWeek: 0, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 1, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 2, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 3, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 4, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 5, isWorkingDay: false, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 6, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
  ];

  for (const day of weeklySchedule) {
    await prisma.workingSchedule.upsert({
      where: { dayOfWeek: day.dayOfWeek },
      update: day,
      create: day,
    });
  }

  await prisma.meetingRoom.upsert({
    where: { id: "main-meeting-room" },
    update: {
      name: "اتاق جلسه اصلی",
      description: "اتاق جلسه پیش‌فرض",
      location: "دفتر مرکزی",
      isActive: true,
      sortOrder: 1,
      autoApprovalEnabled: false,
      autoApprovalDelayHours: 4,
    },
    create: {
      id: "main-meeting-room",
      name: "اتاق جلسه اصلی",
      description: "اتاق جلسه پیش‌فرض",
      location: "دفتر مرکزی",
      isActive: true,
      sortOrder: 1,
      autoApprovalEnabled: false,
      autoApprovalDelayHours: 4,
    },
  });

  for (const day of weeklySchedule) {
    await prisma.meetingRoomWeeklySchedule.upsert({
      where: {
        roomId_dayOfWeek: {
          roomId: "main-meeting-room",
          dayOfWeek: day.dayOfWeek,
        },
      },
      update: {
        isWorkingDay: day.isWorkingDay,
        startTime: day.startTime,
        endTime: day.endTime,
      },
      create: {
        roomId: "main-meeting-room",
        dayOfWeek: day.dayOfWeek,
        isWorkingDay: day.isWorkingDay,
        startTime: day.startTime,
        endTime: day.endTime,
      },
    });
  }

  await prisma.deskSettings.upsert({
    where: { id: "default" },
    update: { maxAdvanceDays: 14 },
    create: { id: "default", maxAdvanceDays: 14 },
  });

  await prisma.building.upsert({
    where: { id: "main-building" },
    update: { active: true, name: "دفتر مرکزی", sortOrder: 1 },
    create: { id: "main-building", active: true, name: "دفتر مرکزی", sortOrder: 1 },
  });

  for (const day of weeklySchedule) {
    await prisma.buildingWeeklySchedule.upsert({
      where: { buildingId_dayOfWeek: { buildingId: "main-building", dayOfWeek: day.dayOfWeek } },
      update: { endTime: day.endTime, isWorkingDay: day.isWorkingDay, startTime: day.startTime },
      create: { buildingId: "main-building", ...day },
    });
  }

  for (const index of Array.from({ length: 16 }, (_, value) => value + 1)) {
    await prisma.desk.upsert({
      where: { buildingId_name: { buildingId: "main-building", name: `میز ${index}` } },
      update: { active: true, sortOrder: index },
      create: { active: true, name: `میز ${index}`, buildingId: "main-building", sortOrder: index },
    });
  }

  await prisma.lunchSettings.upsert({
    where: { id: "default" },
    update: {
      enabled: true,
      maxAdvanceDays: 7,
      cutoffTime: "23:59",
    },
    create: {
      id: "default",
      enabled: true,
      maxAdvanceDays: 7,
      cutoffTime: "23:59",
    },
  });

  for (const dayOfWeek of Array.from({ length: 7 }, (_, index) => index)) {
    await prisma.lunchWeeklySchedule.upsert({
      where: { dayOfWeek },
      update: {
        isServiceDay: dayOfWeek !== 5,
      },
      create: {
        dayOfWeek,
        isServiceDay: dayOfWeek !== 5,
      },
    });
  }

  for (const name of ["ساختمان A", "ساختمان B"]) {
    await prisma.building.upsert({
      where: { name },
      update: { active: true },
      create: { name, active: true },
    });
  }

  const orthodonticsDocumentsContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "در صورت استفاده از پوشش بیمه تکمیلی برای هزینه‌های ارتودنسی، ارائهٔ مدارک زیر الزامی است:",
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "گزارش کامل پزشک شامل:" }],
      },
      {
        type: "bulletList",
        content: [
          "تاریخ شروع درمان",
          "علت و تشخیص",
          "نوع درمان",
          "مبلغ کل درمان",
          "مبلغ پیش‌پرداخت",
          "به‌تفکیک مبلغ و تاریخ اقساط پرداخت‌شده",
          "گرافی پانورکس و سفالومتری مربوط به قبل از شروع درمان",
          "فوتوگرافی بعد از درمان",
        ].map((text) => ({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text }],
            },
          ],
        })),
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "همچنین اگر تاریخ شروع درمان مربوط به قرارداد قبلی بیمه تکمیلی باشد، لازم است از آن بیمه استعلام گرفته و ضمیمه شود.",
          },
        ],
      },
    ],
  };

  const orthodonticsDocumentsText = [
    "در صورت استفاده از پوشش بیمه تکمیلی برای هزینه‌های ارتودنسی، ارائهٔ مدارک زیر الزامی است:",
    "گزارش کامل پزشک شامل:",
    "- تاریخ شروع درمان",
    "- علت و تشخیص",
    "- نوع درمان",
    "- مبلغ کل درمان",
    "- مبلغ پیش‌پرداخت",
    "- به‌تفکیک مبلغ و تاریخ اقساط پرداخت‌شده",
    "- گرافی پانورکس و سفالومتری مربوط به قبل از شروع درمان",
    "- فوتوگرافی بعد از درمان",
    "همچنین اگر تاریخ شروع درمان مربوط به قرارداد قبلی بیمه تکمیلی باشد، لازم است از آن بیمه استعلام گرفته و ضمیمه شود.",
  ].join("\n\n");

  await prisma.wikiPage.upsert({
    where: { slug: "مدارک-مورد-نیاز-جهت-ارتودنسی" },
    update: {
      contentJson: orthodonticsDocumentsContent,
      contentText: orthodonticsDocumentsText,
      isHidden: false,
      title: "مدارک مورد نیاز جهت ارتودنسی",
      updatedById: admin.id,
    },
    create: {
      contentJson: orthodonticsDocumentsContent,
      contentText: orthodonticsDocumentsText,
      createdById: admin.id,
      isHidden: false,
      slug: "مدارک-مورد-نیاز-جهت-ارتودنسی",
      sortOrder: 0,
      title: "مدارک مورد نیاز جهت ارتودنسی",
      updatedById: admin.id,
    },
  });

  const administrativeCategory = await prisma.wikiPage.findFirst({
    where: {
      deletedAt: null,
      slug: "اداری",
    },
    select: { id: true },
  });

  const administrativeGuide = await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "همان‌طور که احتمالاً در جریان هستید، تغییراتی در برخی فرآیندها و ساختارهای اداری ایجاد شده است. ما در مجموعه سرمایه انسانی بلوط تلاش می‌کنیم سرویس‌های مورد نیاز همکاران عزیز را در حوزه اداری، متناسب با شرایط فعلی ارائه دهیم.",
      ),
      paragraph(
        "در زیرصفحه‌های این راهنما، توضیحات کامل‌تری درباره این خدمات و فرآیندها آورده شده است. با توجه به اینکه برخی ضوابط و مقررات اداری و مالی بلوط با مهمان متفاوت است، مهم‌ترین نکات را به‌صورت خلاصه گردآوری کرده‌ایم تا تصویر روشن‌تری از شباهت‌ها، تفاوت‌ها و فرآیندها در اختیار شما قرار گیرد.",
      ),
      paragraph("تیرماه ۱۴۰۵ · سرمایه انسانی بلوط"),
    ),
    contentText: [
      "همان‌طور که احتمالاً در جریان هستید، تغییراتی در برخی فرآیندها و ساختارهای اداری ایجاد شده است. ما در مجموعه سرمایه انسانی بلوط تلاش می‌کنیم سرویس‌های مورد نیاز همکاران عزیز را در حوزه اداری، متناسب با شرایط فعلی ارائه دهیم.",
      "در زیرصفحه‌های این راهنما، توضیحات کامل‌تری درباره این خدمات و فرآیندها آورده شده است. با توجه به اینکه برخی ضوابط و مقررات اداری و مالی بلوط با مهمان متفاوت است، مهم‌ترین نکات را به‌صورت خلاصه گردآوری کرده‌ایم تا تصویر روشن‌تری از شباهت‌ها، تفاوت‌ها و فرآیندها در اختیار شما قرار گیرد.",
      "تیرماه ۱۴۰۵ · سرمایه انسانی بلوط",
    ].join("\n\n"),
    parentId: administrativeCategory?.id ?? null,
    slug: "راهنمای-فرآیندهای-اداری",
    sortOrder: administrativeCategory ? 1 : 0,
    title: "راهنمای فرآیندهای اداری",
  });

  const administrativeServices = await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph("راهنماهای مرتبط با خدمات روزمرهٔ واحد اداری را در زیرصفحه‌ها ببینید."),
    ),
    contentText: "راهنماهای مرتبط با خدمات روزمرهٔ واحد اداری را در زیرصفحه‌ها ببینید.",
    parentId: administrativeGuide.id,
    slug: "خدمات-واحد-اداری",
    sortOrder: 0,
    title: "خدمات واحد اداری",
  });

  const infrastructureCategory = await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(),
    contentText: "",
    slug: "زیرساخت",
    sortOrder: 10,
    title: "زیرساخت",
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "ارائه خدمات و پیگیری درخواست‌های اداری همکاران از طریق واحد اداری انجام می‌شود. بستر رسمی ارتباط با واحد اداری در حال راه‌اندازی است و ان‌شاءالله در آینده نزدیک در دسترس‌تان قرار خواهد گرفت. تا زمان راه‌اندازی ایمیل بلوط، می‌توانید درخواست‌های اداری خود را به‌صورت موقت از طریق پیام‌رسان «بله» به آقای قاسم کاوسی (@ghkavoosi) ارسال نمایید.",
      ),
    ),
    contentText:
      "ارائه خدمات و پیگیری درخواست‌های اداری همکاران از طریق واحد اداری انجام می‌شود. بستر رسمی ارتباط با واحد اداری در حال راه‌اندازی است و ان‌شاءالله در آینده نزدیک در دسترس‌تان قرار خواهد گرفت. تا زمان راه‌اندازی ایمیل بلوط، می‌توانید درخواست‌های اداری خود را به‌صورت موقت از طریق پیام‌رسان «بله» به آقای قاسم کاوسی (@ghkavoosi) ارسال نمایید.",
    parentId: administrativeServices.id,
    slug: "ارتباط-با-واحد-اداری",
    sortOrder: 0,
    title: "ارتباط با واحد اداری",
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(paragraph("واریز حقوق در پانزدهم هر ماه انجام می‌شود.")),
    contentText: "واریز حقوق در پانزدهم هر ماه انجام می‌شود.",
    parentId: administrativeServices.id,
    slug: "واریز-حقوق",
    sortOrder: 1,
    title: "واریز حقوق",
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "برای ثبت درخواست مساعده در پیام‌رسان بله به آقای کاوسی پیام بدهید. هر همکار در هر ماه تنها یک بار می‌تواند درخواست مساعده ثبت کند و سقف مبلغ آن معادل ۵۰ درصد حقوق ماهانه است. معمولاً پرداخت مساعده طی حداکثر یک هفته انجام می‌شود.",
      ),
    ),
    contentText:
      "برای ثبت درخواست مساعده در پیام‌رسان بله به آقای کاوسی پیام بدهید. هر همکار در هر ماه تنها یک بار می‌تواند درخواست مساعده ثبت کند و سقف مبلغ آن معادل ۵۰ درصد حقوق ماهانه است. معمولاً پرداخت مساعده طی حداکثر یک هفته انجام می‌شود.",
    parentId: administrativeServices.id,
    slug: "مساعده",
    sortOrder: 2,
    title: "مساعده",
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "قوانین مربوط به کارکرد، شامل حضور و غیاب، شناوری، شیفت‌های کاری، مرخصی استحقاقی، اضافه‌کاری، کسر کار و موارد مشابه، همانند گذشته خواهد بود و در این بخش تغییری ایجاد نشده است.",
      ),
      paragraph(
        "در خصوص مرخصی استعلاجی، مجموع مرخصی سالانه به ۹ روز افزایش یافته است که در هر ماه حداکثر ۳ روز مرخصی استعلاجی قابل استفاده خواهد بود. همچنین برای ثبت و تأیید این نوع مرخصی، لطفاً گواهی پزشک را برای واحد اداری ارسال کنید.",
      ),
    ),
    contentText: [
      "قوانین مربوط به کارکرد، شامل حضور و غیاب، شناوری، شیفت‌های کاری، مرخصی استحقاقی، اضافه‌کاری، کسر کار و موارد مشابه، همانند گذشته خواهد بود و در این بخش تغییری ایجاد نشده است.",
      "در خصوص مرخصی استعلاجی، مجموع مرخصی سالانه به ۹ روز افزایش یافته است که در هر ماه حداکثر ۳ روز مرخصی استعلاجی قابل استفاده خواهد بود. همچنین برای ثبت و تأیید این نوع مرخصی، لطفاً گواهی پزشک را برای واحد اداری ارسال کنید.",
    ].join("\n\n"),
    parentId: administrativeServices.id,
    slug: "قوانین-کارکرد",
    sortOrder: 3,
    title: "قوانین کارکرد",
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "برای کمک به رفع برخی مسائل و نیازهای مهم همکاران، امکان دریافت امتیاز وام قرض‌الحسنه از طریق بانک رسالت فراهم شده است. این امکان به‌طور خودکار برای همه همکاران در نظر گرفته نمی‌شود و پس از بررسی درخواست‌ها و متناسب با ضرورت و ظرفیت تخصیص داده خواهد شد.",
      ),
      paragraph(
        "برای ثبت درخواست، لطفاً به آقای محمدامین محب علی (mohebali@mahsan.co) ایمیل بزنید و در آن مبلغ مورد نظر و دلایل نیاز خود را توضیح دهید. درخواست شما بررسی می‌شود و در صورت تأیید، از طریق واحد اداری به شما اعلام خواهد شد.",
      ),
      heading("زمان‌بندی و میزان امتیاز وام"),
      bulletList([
        "امتیازهای وام ۱۲ ماهه در نظر گرفته شده است و هر فرد پس از گذشت حداقل ۱۲ ماه از آخرین درخواست، امکان ثبت درخواست وام جدید دارد. این موضوع به وام‌های سال گذشته نیز عطف می‌شود؛ بنابراین باید از آخرین دریافت امتیاز وام شما در سال گذشته، حداقل ۱۲ ماه سپری شده باشد تا امکان درخواست جدید در سال جاری را داشته باشید.",
        "سقف امتیاز وام برای هر فرد در سال ۱۴۰۵، متناسب با میزان حقوق و حدود دو برابر خالص دریافتی تا سقف ۴۵۰ میلیون تومان است؛ در واقع یک ششم حقوق خالص شما در دوازده ماه در نظر گرفته می‌شود که حدود دو برابر حقوق خالص‌تان خواهد بود.",
      ]),
      paragraph(
        "با توجه به حساسیت موضوعات مالی، خواهشمندیم درخواست‌های مرتبط با وام را صرفاً از مسیر آقای محمدامین محب علی پیگیری کنید.",
      ),
    ),
    contentText: [
      "برای کمک به رفع برخی مسائل و نیازهای مهم همکاران، امکان دریافت امتیاز وام قرض‌الحسنه از طریق بانک رسالت فراهم شده است. این امکان به‌طور خودکار برای همه همکاران در نظر گرفته نمی‌شود و پس از بررسی درخواست‌ها و متناسب با ضرورت و ظرفیت تخصیص داده خواهد شد.",
      "برای ثبت درخواست، لطفاً به آقای محمدامین محب علی (mohebali@mahsan.co) ایمیل بزنید و در آن مبلغ مورد نظر و دلایل نیاز خود را توضیح دهید. درخواست شما بررسی می‌شود و در صورت تأیید، از طریق واحد اداری به شما اعلام خواهد شد.",
      "زمان‌بندی و میزان امتیاز وام",
      "- امتیازهای وام ۱۲ ماهه در نظر گرفته شده است و هر فرد پس از گذشت حداقل ۱۲ ماه از آخرین درخواست، امکان ثبت درخواست وام جدید دارد. این موضوع به وام‌های سال گذشته نیز عطف می‌شود؛ بنابراین باید از آخرین دریافت امتیاز وام شما در سال گذشته، حداقل ۱۲ ماه سپری شده باشد تا امکان درخواست جدید در سال جاری را داشته باشید.",
      "- سقف امتیاز وام برای هر فرد در سال ۱۴۰۵، متناسب با میزان حقوق و حدود دو برابر خالص دریافتی تا سقف ۴۵۰ میلیون تومان است؛ در واقع یک ششم حقوق خالص شما در دوازده ماه در نظر گرفته می‌شود که حدود دو برابر حقوق خالص‌تان خواهد بود.",
      "با توجه به حساسیت موضوعات مالی، خواهشمندیم درخواست‌های مرتبط با وام را صرفاً از مسیر آقای محمدامین محب علی پیگیری کنید.",
    ].join("\n\n"),
    parentId: administrativeGuide.id,
    slug: "وام",
    sortOrder: 1,
    title: "وام",
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "برای دریافت هرگونه گواهی، مانند اشتغال به کار یا کسر از حقوق، که نیاز به مهر و امضای شرکت دارد، کافی است درخواست خود را برای واحد اداری، آقای کاوسی، ارسال نمایید.",
      ),
      paragraph("در پیام ارسالی، لطفاً موارد زیر را ذکر کنید:"),
      bulletList([
        "مخاطب گواهی؛ برای مثال در صورت ارائه به بانک: نام بانک، نام شعبه و کد شعبه.",
        "اطلاعات تکمیلی متناسب با نوع گواهی؛ برای نمونه در گواهی کسر از حقوق: عنوان وام، مبلغ وام، تعداد اقساط و در صورتی که گواهی برای ضمانت فرد دیگری صادر می‌شود، نام و نام خانوادگی و کد ملی ایشان.",
      ]),
      paragraph(
        "توجه داشته باشید که مجموع تعهدات مربوط به اقساط گواهی‌های کسر از حقوق، نباید از یک چهارم مبلغ ناخالص حقوق بیشتر باشد.",
      ),
    ),
    contentText: [
      "برای دریافت هرگونه گواهی، مانند اشتغال به کار یا کسر از حقوق، که نیاز به مهر و امضای شرکت دارد، کافی است درخواست خود را برای واحد اداری، آقای کاوسی، ارسال نمایید.",
      "در پیام ارسالی، لطفاً موارد زیر را ذکر کنید:",
      "- مخاطب گواهی؛ برای مثال در صورت ارائه به بانک: نام بانک، نام شعبه و کد شعبه.",
      "- اطلاعات تکمیلی متناسب با نوع گواهی؛ برای نمونه در گواهی کسر از حقوق: عنوان وام، مبلغ وام، تعداد اقساط و در صورتی که گواهی برای ضمانت فرد دیگری صادر می‌شود، نام و نام خانوادگی و کد ملی ایشان.",
      "توجه داشته باشید که مجموع تعهدات مربوط به اقساط گواهی‌های کسر از حقوق، نباید از یک چهارم مبلغ ناخالص حقوق بیشتر باشد.",
    ].join("\n\n"),
    parentId: administrativeGuide.id,
    slug: "گواهی‌های-اداری",
    sortOrder: 2,
    title: "گواهی‌های اداری",
  });

  const supplementaryInsurance = await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      paragraph(
        "شرایط استفاده از بیمه تکمیلی دی، برای همکاران بلوط بدون تغییر ادامه خواهد داشت و می‌توانید مانند گذشته از خدمات این بیمه استفاده کنید.",
      ),
      paragraph(
        "مطابق اطلاع‌رسانی قبلی، لازم است اسناد مربوط به هزینه‌های ویزیت، دارو و خدمات پاراکلینیکی را خودتان در سامانه بیمه دی به نشانی didar24.com بارگذاری کنید. در مورد هزینه‌های دندانپزشکی و بستری بیمارستانی، لازم است مستندات فیزیکی به واحد اداری تحویل داده شود.",
      ),
      paragraph("برای تحویل حضوری این مستندات به واحد اداری، با آقای کاوسی هماهنگ شوید."),
    ),
    contentText: [
      "شرایط استفاده از بیمه تکمیلی دی، برای همکاران بلوط بدون تغییر ادامه خواهد داشت و می‌توانید مانند گذشته از خدمات این بیمه استفاده کنید.",
      "مطابق اطلاع‌رسانی قبلی، لازم است اسناد مربوط به هزینه‌های ویزیت، دارو و خدمات پاراکلینیکی را خودتان در سامانه بیمه دی به نشانی didar24.com بارگذاری کنید. در مورد هزینه‌های دندانپزشکی و بستری بیمارستانی، لازم است مستندات فیزیکی به واحد اداری تحویل داده شود.",
      "برای تحویل حضوری این مستندات به واحد اداری، با آقای کاوسی هماهنگ شوید.",
    ].join("\n\n"),
    parentId: administrativeGuide.id,
    slug: "بیمه-تکمیلی",
    sortOrder: 3,
    title: "بیمه تکمیلی",
  });

  await prisma.wikiPage.update({
    where: { slug: "مدارک-مورد-نیاز-جهت-ارتودنسی" },
    data: {
      parentId: supplementaryInsurance.id,
      sortOrder: 0,
      updatedById: admin.id,
    },
  });

  await upsertWikiPage({
    adminId: admin.id,
    contentJson: wikiDocument(
      heading("macOS"),
      paragraph(
        "برای اتصال به پوشهٔ اختصاصی خود در فایل‌سرور، این دستور را در ترمینال اجرا کنید:",
      ),
      codeBlock('open "smb://<نام‌کاربری>@diode.balout.co/<نام‌کاربری>"'),
      paragraph(
        "نام‌کاربری را با نام کاربری خودتان جایگزین کنید. بخش بعد از آخرین / مسیر پوشهٔ اختصاصی شماست و برای هر همکار متفاوت است.",
      ),
      heading("Linux (Debian/Ubuntu)"),
      paragraph("برای اتصال دائمی در Linux، ابتدا ابزار CIFS را نصب کنید:"),
      codeBlock("sudo apt update && sudo apt install -y cifs-utils"),
      paragraph("سپس مسیر اتصال و فایل اعتبارنامه را بسازید:"),
      codeBlock("sudo mkdir -p /mnt/diode\nsudo install -m 700 -d /etc/samba\nsudo nano /etc/samba/<نام‌کاربری>.cred"),
      paragraph("محتوای فایل اعتبارنامه باید به شکل زیر باشد:"),
      codeBlock("username=<نام‌کاربری>\npassword=<گذرواژه>\ndomain=BALOUT"),
      paragraph("دسترسی فایل اعتبارنامه را محدود کنید:"),
      codeBlock("sudo chmod 600 /etc/samba/<نام‌کاربری>.cred"),
      paragraph("این خط را به انتهای فایل /etc/fstab اضافه کنید:"),
      codeBlock(
        "//diode.balout.co/<نام‌کاربری> /mnt/diode cifs credentials=/etc/samba/<نام‌کاربری>.cred,vers=3.0,_netdev 0 0",
      ),
      paragraph(
        "در پایان، پیش از راه‌اندازی مجدد سیستم، اتصال را با این دستور بررسی کنید: sudo mount -a",
      ),
    ),
    contentText: [
      "macOS",
      "برای اتصال به پوشهٔ اختصاصی خود در فایل‌سرور، این دستور را در ترمینال اجرا کنید:",
      'open "smb://<نام‌کاربری>@diode.balout.co/<نام‌کاربری>"',
      "نام‌کاربری را با نام کاربری خودتان جایگزین کنید. بخش بعد از آخرین / مسیر پوشهٔ اختصاصی شماست و برای هر همکار متفاوت است.",
      "Linux (Debian/Ubuntu)",
      "برای اتصال دائمی در Linux، ابتدا ابزار CIFS را نصب کنید:",
      "sudo apt update && sudo apt install -y cifs-utils",
      "سپس مسیر اتصال و فایل اعتبارنامه را بسازید:",
      "sudo mkdir -p /mnt/diode\nsudo install -m 700 -d /etc/samba\nsudo nano /etc/samba/<نام‌کاربری>.cred",
      "محتوای فایل اعتبارنامه باید به شکل زیر باشد:",
      "username=<نام‌کاربری>\npassword=<گذرواژه>\ndomain=BALOUT",
      "دسترسی فایل اعتبارنامه را محدود کنید:",
      "sudo chmod 600 /etc/samba/<نام‌کاربری>.cred",
      "این خط را به انتهای فایل /etc/fstab اضافه کنید:",
      "//diode.balout.co/<نام‌کاربری> /mnt/diode cifs credentials=/etc/samba/<نام‌کاربری>.cred,vers=3.0,_netdev 0 0",
      "در پایان، پیش از راه‌اندازی مجدد سیستم، اتصال را با این دستور بررسی کنید: sudo mount -a",
    ].join("\n\n"),
    slug: "اتصال-به-پوشه-اختصاصی-فایل-سرور",
    parentId: infrastructureCategory.id,
    sortOrder: 0,
    title: "دسترسی به دیتادیود",
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
