import { Link } from 'react-router-dom';
import { HiOutlineArrowRight } from 'react-icons/hi';

const CardLink = ({ to, children }) => (
    <Link to={to} className="td-link">
        {children}
        <span className="td-flip">
            <HiOutlineArrowRight size={13} />
        </span>
    </Link>
);

export default CardLink;