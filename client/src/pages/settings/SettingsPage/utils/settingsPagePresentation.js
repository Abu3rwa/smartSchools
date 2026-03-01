/**
 * Get initials from first and last name
 * @param {string} firstName 
 * @param {string} lastName 
 * @returns {string}
 */
export const getUserInitials = (firstName, lastName) => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
};
