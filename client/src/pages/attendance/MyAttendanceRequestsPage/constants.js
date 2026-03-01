import { HiOutlineClock, HiOutlineCheck, HiOutlineX } from "react-icons/hi";

export const statusConfig = {
  pending: {
    label: "Pending",
    Icon: HiOutlineClock,
    className: "status-pending",
  },
  approved: {
    label: "Approved",
    Icon: HiOutlineCheck,
    className: "status-approved",
  },
  rejected: {
    label: "Rejected",
    Icon: HiOutlineX,
    className: "status-rejected",
  },
};
