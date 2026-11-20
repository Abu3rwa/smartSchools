import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { HiOutlineX } from 'react-icons/hi';

/**
 * Reusable product figure. It renders only an approved asset: when the asset
 * is missing or fails to load the figure is removed and the surrounding copy
 * stays readable. The viewer is mounted for this figure only.
 */
export default function LandingScreenshots({ copy, asset, alt, caption, priority = false, allowZoom = false }) {
    const [failed, setFailed] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);

    if (!asset || !asset.src || failed) return null;

    return (
        <Box sx={{ minWidth: 0 }}>
            <Box
                component="img"
                src={asset.src}
                srcSet={asset.srcSet}
                sizes={asset.sizes}
                alt={alt}
                width={asset.width}
                height={asset.height}
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                onError={() => setFailed(true)}
                sx={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    borderRadius: '16px',
                    border: 1,
                    borderColor: 'divider',
                    boxShadow: '0 18px 40px -30px rgba(15, 23, 42, 0.5)',
                    bgcolor: 'background.paper',
                }}
            />

            {caption || (allowZoom && asset.zoomSrc) ? (
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ mt: 1 }}
                >
                    {caption ? (
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                            {caption}
                        </Typography>
                    ) : (
                        <span />
                    )}
                    {allowZoom && asset.zoomSrc ? (
                        <Button size="small" onClick={() => setViewerOpen(true)} sx={{ flexShrink: 0 }}>
                            {copy?.actions?.viewLarger}
                        </Button>
                    ) : null}
                </Stack>
            ) : null}

            {viewerOpen ? (
                <Dialog open onClose={() => setViewerOpen(false)} maxWidth="lg" fullWidth>
                    <DialogTitle
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
                    >
                        {caption}
                        <IconButton onClick={() => setViewerOpen(false)} aria-label={copy?.images?.closeViewer}>
                            <HiOutlineX size={22} />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent>
                        <Box
                            component="img"
                            src={asset.zoomSrc}
                            alt={alt}
                            sx={{ display: 'block', width: '100%', height: 'auto', borderRadius: 1 }}
                        />
                    </DialogContent>
                </Dialog>
            ) : null}
        </Box>
    );
}
