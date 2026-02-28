import { HiOutlinePlus } from 'react-icons/hi';

const MessagesFab = ({ isHidden, onClick }) => (
    <button
        type="button"
        className={`messages-fab btn btn-primary ${isHidden ? 'hidden' : ''}`}
        onClick={onClick}
        aria-label="Create new message"
    >
        <HiOutlinePlus size={18} />
        <span>New Message</span>
    </button>
);

export default MessagesFab;