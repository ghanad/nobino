declare module "pholiday" {
  export type PHolidayEvent = {
    event: string;
    isFriday?: boolean;
    isHoliday: boolean;
  };

  export type PHolidayDate = {
    events(): PHolidayEvent[];
    isHoliday(): boolean;
  };

  export default function pholiday(
    input?: string | Date,
    format?: string,
  ): PHolidayDate;
}
