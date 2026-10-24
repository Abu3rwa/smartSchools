import { HiOutlinePlus } from "react-icons/hi2";
import { useTranslation } from "react-i18next";

const StandardsPageHeader = ({ showAddStandard, onAddStandard, children }) => {
  const { t } = useTranslation(["standards"]);

  return (
    <div className="standards-toolbar">
      <div className="standards-toolbar__tabs">{children}</div>
      {showAddStandard && (
        <button
          type="button"
          className="btn btn-primary standards-toolbar__add"
          onClick={onAddStandard}
        >
          <HiOutlinePlus size={18} aria-hidden="true" />
          {t("standards:header.add")}
        </button>
      )}
    </div>
  );
};

export default StandardsPageHeader;
