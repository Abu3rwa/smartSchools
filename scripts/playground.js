function toAttendanceDate(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  console.log("date", date);
  return date;
}
toAttendanceDate(new Date());
