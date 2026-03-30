const AssignmentsPageHeader = ({ academicYear }) => {
  return (
    <div className="page-header">
      <h1>My assignments</h1>
      <p className="subtitle">
        Open each assignment to view full instructions, due date, and lesson links.
        {academicYear ? ` Academic Year: ${academicYear}.` : ''}
      </p>
    </div>
  );
};

export default AssignmentsPageHeader;
