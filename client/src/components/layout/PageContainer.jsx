import { Box } from '@mui/material';

/**
 * Responsive, theme-aware container for page content.
 * Use inside main.page-content for consistent max-width and padding across breakpoints.
 * Aligns with MUI breakpoints (xs/sm/md/lg/xl).
 */
const PageContainer = ({ children, maxWidth = true, ...props }) => (
  <Box
    className="page-container"
    sx={{
      width: '100%',
      maxWidth: maxWidth ? 'var(--content-max-width, 1400px)' : undefined,
      margin: '0 auto',
      px: { xs: 0, sm: 0, md: 0 },
      ...props.sx,
    }}
    {...props}
  >
    {children}
  </Box>
);

export default PageContainer;
