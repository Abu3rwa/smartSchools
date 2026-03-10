import { HiOutlineClock, HiOutlineCheck, HiOutlineX } from "react-icons/hi";

export const statusConfig = {
  pending: {
    labelKey: "status.pending",
    Icon: HiOutlineClock,
    className: "status-pending",
  },
  approved: {
    labelKey: "status.approved",
    Icon: HiOutlineCheck,
    className: "status-approved",
  },
  rejected: {
    labelKey: "status.rejected",
    Icon: HiOutlineX,
    className: "status-rejected",
  },
};
