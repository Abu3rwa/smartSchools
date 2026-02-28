import { HiOutlineUserGroup } from 'react-icons/hi';

const UsersTab = ({ users, loading, onEdit, modal }) => (
  <div className="tab-content">
    {loading ? (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    ) : (
      <div className="users-table-wrap card">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id}>
                <td>{user.firstName} {user.lastName}</td>
                <td>{user.email}</td>
                <td>
                  <span className="badge badge-primary">{user.role}</span>
                </td>
                <td>{user.department?.name ?? '—'}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => onEdit(user)}>
                    Edit role
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="empty-state">
            <HiOutlineUserGroup size={48} />
            <p>No users in this school.</p>
          </div>
        )}
      </div>
    )}
    {modal}
  </div>
);

export default UsersTab;