import React, { useState, useRef, useEffect } from 'react';
import { Box, Button, Typography, Avatar, CircularProgress, IconButton } from '@mui/material';
import { HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

const ImageUploader = ({
    currentImageUrl,
    onUpload,
    onDelete,
    isUploading,
    label = 'Upload Image',
    shape = 'circular' // 'circular' or 'rounded' or 'square'
}) => {
    const [preview, setPreview] = useState(null);
    const fileInputRef = useRef(null);

    // Clean up object URLs to avoid memory leaks
    useEffect(() => {
        return () => {
            if (preview) {
                URL.revokeObjectURL(preview);
            }
        };
    }, [preview]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Provide a soft check for typical 5MB multer limits
            if (file.size > 5 * 1024 * 1024) {
                alert('File size exceeds the 5MB limit. Please choose a smaller file.');
                e.target.value = '';
                return;
            }

            // Do not rely only on the input accept attribute
            if (!file.type || !file.type.startsWith('image/')) {
                alert('Please select a valid image file.');
                e.target.value = '';
                return;
            }

            // Create preview strictly to show the user what they selected
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);

            // Trigger upload callback out to the parent component
            if (onUpload) {
                onUpload(file);
            }

            // Allow selecting the same file again if needed
            e.target.value = '';
        }
    };

    const handleDelete = () => {
        setPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        if (onDelete) {
            onDelete();
        }
    };

    const triggerFileSelect = () => {
        fileInputRef.current?.click();
    };

    const displayImage = preview || currentImageUrl;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Box position="relative">
                <Avatar
                    src={displayImage}
                    variant={shape}
                    sx={{
                        width: 120,
                        height: 120,
                        bgcolor: 'grey.200',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        opacity: isUploading ? 0.5 : 1,
                        transition: 'opacity 0.2s'
                    }}
                />

                {isUploading && (
                    <CircularProgress
                        size={40}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            marginTop: '-20px',
                            marginLeft: '-20px'
                        }}
                    />
                )}

                <IconButton
                    color="primary"
                    onClick={triggerFileSelect}
                    disabled={isUploading}
                    aria-label="Upload picture"
                    sx={{
                        position: 'absolute',
                        bottom: shape === 'circular' ? 0 : -10,
                        right: shape === 'circular' ? 0 : -10,
                        bgcolor: 'background.paper',
                        boxShadow: 2,
                        '&:hover': { bgcolor: 'grey.100' }
                    }}
                >
                    <HiOutlinePencil size={16} />
                </IconButton>
                  {displayImage && onDelete && (
                <Button
                    startIcon={<HiOutlineTrash size={16} />}
                    color="error"
                    size="small"
                    onClick={handleDelete}
                    disabled={isUploading}
                     
                    sx={{
                        position: 'absolute',
                        top:0,
                        right:0
                             
                    }}
                >
                 </Button>
            )}
            </Box>

          

           

            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />
        </Box>
    );
};

export default ImageUploader;
