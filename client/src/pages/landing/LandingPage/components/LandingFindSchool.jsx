import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import { HiOutlineSearch, HiOutlineX, HiOutlineOfficeBuilding, HiOutlineAcademicCap, HiOutlinePlus } from 'react-icons/hi';

/**
 * Find school section with search and school list. Uses landing-school-item.
 */
export default function LandingFindSchool({
    content,
    searchTerm,
    setSearchTerm,
    hasSearchFilter,
    filtered,
    schoolsToShow,
    noMatchMessage,
    matchingLabel,
    showingLimitText,
    totalSchoolCountLabel,
    filteredSchoolCountLabel,
    handleAction,
    navigate,
}) {
    return (
        <Box id="find-school" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
            <Container maxWidth="md">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.findSchool.overline}</Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.findSchool.title}</Typography>
                <Typography color="text.secondary" align="center" sx={{ mb: 3 }}>{content.findSchool.subtitle}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Chip size="small" label={totalSchoolCountLabel} sx={{ bgcolor: 'action.selected', color: 'primary.main' }} />
                    {hasSearchFilter ? <Chip size="small" label={filteredSchoolCountLabel} variant="outlined" /> : null}
                </Box>
                <TextField
                    fullWidth
                    placeholder={content.findSchool.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <HiOutlineSearch size={20} />
                            </InputAdornment>
                        ),
                        endAdornment: hasSearchFilter ? (
                            <InputAdornment position="end">
                                <IconButton size="small" aria-label="Clear search" onClick={() => setSearchTerm('')}>
                                    <HiOutlineX size={16} />
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                    }}
                    sx={{ mb: 1.5 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
                    Type at least 2 letters to quickly find your school.
                </Typography>
                <Box sx={{ mb: 3 }}>
                    {hasSearchFilter && filtered.length === 0 ? (
                        <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', borderStyle: 'dashed' }}>
                            <HiOutlineSearch size={48} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden />
                            <Typography color="text.secondary">{noMatchMessage}</Typography>
                        </Paper>
                    ) : schoolsToShow.length > 0 ? (
                        <>
                            {!hasSearchFilter ? (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{content.findSchool.schoolsLabel}</Typography>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{matchingLabel}</Typography>
                            )}
                            <Grid container spacing={2}>
                                {schoolsToShow.map((school) => (
                                    <Grid item xs={12} sm={6} key={school._id}>
                                        <Button className="landing-school-item" fullWidth variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 2, px: 2 }} onClick={() => navigate(`/login/${school.slug}`)}>
                                            <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: 'primary.main', opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1.5 }}>
                                                <HiOutlineOfficeBuilding size={22} style={{ color: 'var(--mui-palette-primary-main)' }} />
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body1" fontWeight={600} noWrap>{school.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">Up to {school.settings?.maxStudents || 50} students</Typography>
                                            </Box>
                                        </Button>
                                    </Grid>
                                ))}
                            </Grid>
                            {filtered.length > 8 && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>{showingLimitText}</Typography>
                            )}
                        </>
                    ) : (
                        <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', borderStyle: 'dashed' }}>
                            <HiOutlineAcademicCap size={48} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden />
                            <Typography color="text.secondary">{content.findSchool.noSchoolsMessage}</Typography>
                        </Paper>
                    )}
                </Box>
                <Typography color="text.secondary" align="center" sx={{ mb: 1.5 }}>{content.findSchool.registerPrompt}</Typography>
                <Box sx={{ textAlign: 'center' }}>
                    <Button variant="contained" startIcon={<HiOutlinePlus size={18} />} onClick={() => handleAction('register')}>
                        {content.findSchool.registerCtaLabel}
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
