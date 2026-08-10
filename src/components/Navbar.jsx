import {
  AppBar,
  Box,
  Collapse,
  Drawer,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Instagram as InstagramIcon,
  X as XIcon,
  LinkedIn as LinkedInIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  Home as HomeIcon,
} from "@mui/icons-material";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { locations } from "../data/locations";

const navItems = [
  { label: "Learn To Drive", icon: "/nav/drive.svg" },
  { label: "Buy & Sell Car", icon: "/nav/car.svg" },
];

const Navbar2 = ({
  backgroundColor = "#FAF9E6",
  logo = "./LANE_LOGO.svg",
  burgerMenu = "/PurpleHamburger.png",
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [buySellAnchor, setBuySellAnchor] = useState(null);
  const [learnDriveAnchor, setLearnDriveAnchor] = useState(null);
  const [openDrawerGroup, setOpenDrawerGroup] = useState(null);
  const drivingDrawerOpen = openDrawerGroup === "driving";
  const buySellDrawerOpen = openDrawerGroup === "buysell";
  const [hideBottomBar, setHideBottomBar] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setHideBottomBar(
        currentScrollY > lastScrollY.current && currentScrollY > 80
      );
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const openBuySell = (event) => setBuySellAnchor(event.currentTarget);
  const closeBuySell = () => setBuySellAnchor(null);

  const openLearnDrive = (event) => setLearnDriveAnchor(event.currentTarget);
  const closeLearnDrive = () => setLearnDriveAnchor(null);

  const buySellMenuProps = {
    sx: {
      backgroundColor: "#D9FF7A",
      border: "1.5px solid #000000",
      borderRadius: "16px",
      boxShadow: "3px 4px 0px rgba(0,0,0,0.25)",
      minWidth: 180,
      overflow: "hidden",
      py: 0,
    },
  };

  const buySellMenuItemSx = {
    justifyContent: "center",
    fontFamily: "Bricolage Grotesque",
    fontWeight: 700,
    fontSize: "1.05rem",
    color: "#000000",
    py: 1.75,
    "&:hover": { backgroundColor: "rgba(0,0,0,0.06)" },
  };

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleClose = () => {
    setDrawerOpen(false);
  };

  const drawerContent = (
    <Box
      role="presentation"
      display="flex"
      flexDirection="column"
      height="100%"
      position="relative"
      sx={{ textAlign: "center" }}
    >
      <IconButton
        onClick={handleClose}
        sx={{
          position: "absolute",
          right: 8,
          top: 8,
          color: "#00CE84",
          "&:hover": {
            color: "#00CE84",
          },
        }}
      >
        <CloseIcon />
      </IconButton>

      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          margin="20px"
          mt={6}
        >
          <Typography
            variant="h4"
            component={Link}
            to="/"
            onClick={handleClose} // Add this line to close the drawer when clicking the logo
            sx={{
              color: "green",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <img
              src="/LANE_LOGO.svg"
              alt="Lane logo"
              width={isMobile ? 70 : 80}
              style={{ marginRight: theme.spacing(1), zIndex: 2 }}
            />
          </Typography>
        </Box>
        <List>
          <ListItem button component={Link} to="/" onClick={handleClose}>
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                  }}
                >
                  Home
                </Typography>
              }
            />
          </ListItem>

          <ListItem
            button
            component={Link}
            to="/about-us"
            onClick={handleClose}
          >
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                  }}
                >
                  About Us
                </Typography>
              }
            />
          </ListItem>

          <ListItem
            button
            onClick={() =>
              setOpenDrawerGroup((prev) =>
                prev === "driving" ? null : "driving"
              )
            }
          >
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                  }}
                >
                  Driving{" "}
                  {drivingDrawerOpen ? <ExpandLess /> : <ExpandMore />}
                </Typography>
              }
            />
          </ListItem>
          <Collapse in={drivingDrawerOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              <ListItem
                button
                component={Link}
                to="/courses"
                onClick={handleClose}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: "Bricolage Grotesque",
                        textAlign: "center",
                        color: "text.secondary",
                      }}
                    >
                      Courses
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem
                button
                component={Link}
                to="/rto-services"
                onClick={handleClose}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: "Bricolage Grotesque",
                        textAlign: "center",
                        color: "text.secondary",
                      }}
                    >
                      RTO Services
                    </Typography>
                  }
                />
              </ListItem>
            </List>
          </Collapse>

          <ListItem
            button
            onClick={() =>
              setOpenDrawerGroup((prev) =>
                prev === "buysell" ? null : "buysell"
              )
            }
          >
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                  }}
                >
                  Buy and Sell{" "}
                  {buySellDrawerOpen ? <ExpandLess /> : <ExpandMore />}
                </Typography>
              }
            />
          </ListItem>
          <Collapse in={buySellDrawerOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              <ListItem
                button
                component={Link}
                to="/buyer"
                onClick={handleClose}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: "Bricolage Grotesque",
                        textAlign: "center",
                        color: "text.secondary",
                      }}
                    >
                      Buy Car
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem
                button
                component={Link}
                to="/sell-used-car"
                onClick={handleClose}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: "Bricolage Grotesque",
                        textAlign: "center",
                        color: "text.secondary",
                      }}
                    >
                      Sell Car
                    </Typography>
                  }
                />
              </ListItem>
            </List>
          </Collapse>

          <ListItem button component={Link} to="/blog" onClick={handleClose}>
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                  }}
                >
                  Lane Journal
                </Typography>
              }
            />
          </ListItem>
          <ListItem button onClick={handleMenuOpen}>
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                  }}
                >
                  Locations {anchorEl ? <ExpandLess /> : <ExpandMore />}
                </Typography>
              }
            />
          </ListItem>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            disableScrollLock
            transformOrigin={{ horizontal: "center", vertical: "top" }}
            anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
          >
            {locations.map((location, index) => (
              <MenuItem
                key={index}
                component={Link}
                to={`/driving-school-in/${location.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={handleMenuClose}
                sx={{
                  fontFamily: "Bricolage Grotesque",
                  fontSize: "1rem",
                  "&:hover": {
                    backgroundColor: "#f0f0f0",
                  },
                }}
              >
                {location}
              </MenuItem>
            ))}
          </Menu>
        </List>
      </Box>

      {/* Social Icons */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 2,
          py: 2,
          borderTop: "1px solid rgba(0,0,0,0.1)",
        }}
      >
        <IconButton
          component="a"
          href="https://www.instagram.com/inlane.in/"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            backgroundColor: "black",
            "&:hover": {
              backgroundColor: "black",
            },
            color: "white",
          }}
        >
          <InstagramIcon />
        </IconButton>
        <IconButton
          component="a"
          href="https://x.com/inlane_in/"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            backgroundColor: "black",
            "&:hover": {
              backgroundColor: "black",
            },
            color: "white",
          }}
        >
          <XIcon />
        </IconButton>
        <IconButton
          component="a"
          href="https://www.linkedin.com/company/in-lane/"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            backgroundColor: "black",
            "&:hover": {
              backgroundColor: "black",
            },
            color: "white",
          }}
        >
          <LinkedInIcon />
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" elevation={0}>
        <Toolbar
          sx={{
            backgroundColor: backgroundColor,
            boxShadow: "none",
            padding: theme.spacing(2),
            justifyContent: "space-between",
          }}
        >
          <Box
            sx={{
              width: "100%",
              display: "flex",
              justifyContent: "flex-start",
              alignItems: "center",
              position: "relative",
            }}
          >
            <Typography
              variant="h4"
              component={Link}
              to="/"
              sx={{
                color: "green",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
              }}
            >
              <img
                src={logo}
                alt="Lane logo"
                width={isMobile ? 42 : 60}
                style={{ marginRight: theme.spacing(1), zIndex: 2 }}
              />
            </Typography>

            {/* Nav items: one row on every breakpoint, sized down for mobile so
                logo + items + the fixed hamburger all sit on a single line. */}
            <Box
              sx={{
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                gap: { xs: 2, sm: 3, md: 4 },
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
              }}
            >
              {navItems.map((item) => {
                const isBuySell = item.label === "Buy & Sell Car";
                return (
                  <Box
                    key={item.label}
                    component="button"
                    type="button"
                    onClick={isBuySell ? openBuySell : openLearnDrive}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: { xs: 0.5, md: 1 },
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      font: "inherit",
                    }}
                  >
                    <Box
                      component="img"
                      src={item.icon}
                      alt=""
                      sx={{ width: { xs: 22, sm: 22, md: 28 }, height: { xs: 22, sm: 22, md: 28 } }}
                    />
                    <Typography
                      sx={{
                        display: { xs: "none", sm: "block" },
                        fontFamily: "Bricolage Grotesque",
                        fontWeight: 600,
                        color: "#000000",
                        fontSize: { sm: "0.85rem", md: "1rem" },
                      }}
                    >
                      {item.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            <Menu
              anchorEl={buySellAnchor}
              open={Boolean(buySellAnchor)}
              onClose={closeBuySell}
              disableScrollLock
              anchorOrigin={{
                horizontal: "center",
                vertical: isMobile ? "top" : "bottom",
              }}
              transformOrigin={{
                horizontal: "center",
                vertical: isMobile ? "bottom" : "top",
              }}
              PaperProps={buySellMenuProps}
              MenuListProps={{ sx: { py: 0 } }}
            >
              <MenuItem
                component={Link}
                to="/buyer"
                onClick={closeBuySell}
                sx={{
                  ...buySellMenuItemSx,
                  borderBottom: "1px solid rgba(0,0,0,0.35)",
                }}
              >
                Buy Car
              </MenuItem>
              <MenuItem
                component={Link}
                to="/sell-used-car"
                onClick={closeBuySell}
                sx={buySellMenuItemSx}
              >
                Sell Car
              </MenuItem>
            </Menu>

            <Menu
              anchorEl={learnDriveAnchor}
              open={Boolean(learnDriveAnchor)}
              onClose={closeLearnDrive}
              disableScrollLock
              anchorOrigin={{
                horizontal: "center",
                vertical: isMobile ? "top" : "bottom",
              }}
              transformOrigin={{
                horizontal: "center",
                vertical: isMobile ? "bottom" : "top",
              }}
              PaperProps={buySellMenuProps}
              MenuListProps={{ sx: { py: 0 } }}
            >
              <MenuItem
                component={Link}
                to="/courses"
                onClick={closeLearnDrive}
                sx={{
                  ...buySellMenuItemSx,
                  borderBottom: "1px solid rgba(0,0,0,0.35)",
                }}
              >
                Courses
              </MenuItem>
              <MenuItem
                component={Link}
                to="/rto-services"
                onClick={closeLearnDrive}
                sx={buySellMenuItemSx}
              >
                RTO Services
              </MenuItem>
            </Menu>

            <IconButton
              size="large"
              aria-label="menu"
              aria-controls="menu-appbar"
              onClick={toggleDrawer}
              sx={{
                position: "fixed",
                right: 0,
                width: 80,
                height: 73,
                fontWeight: "bold",
                zIndex: 100,
              }}
            >
              <img
                src={burgerMenu}
                alt="menu icon"
                width={isMobile ? 35 : 40}
                height={isMobile ? 25 : 25}
              />
            </IconButton>
          </Box>

          <Drawer
            open={drawerOpen}
            anchor="right"
            onClose={toggleDrawer}
            PaperProps={{
              sx: {
                width: isMobile ? "70%" : "40%",
              },
            }}
          >
            <Box
              sx={{
                padding: theme.spacing(2.5),
                height: "100vh",
                backgroundColor: "#FFF",
              }}
            >
              {drawerContent}
            </Box>
          </Drawer>
        </Toolbar>
      </AppBar>
      <Box
        component="div"
        sx={{
          position: "relative",
          width: "100%",
          height: isMobile ? "15px" : "auto",
          overflow: "hidden",
          marginTop: "-3px",
        }}
      >
        <Box
          component="img"
          src="/NavbarRoad.svg"
          alt="wave"
          sx={{
            width: isMobile ? "600px" : "100%",
            height: isMobile ? "15px" : "100%",
            display: "block",
            margin: isMobile ? "0 auto" : "0",
            objectFit: "cover",
          }}
        />
      </Box>

      {isMobile && (
        <Box
          sx={{
            display: "flex",
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1200,
            backgroundColor: "#FFFFFF",
            borderTop: "1px solid rgba(0,0,0,0.12)",
            paddingBottom: "env(safe-area-inset-bottom)",
            transform: hideBottomBar ? "translateY(100%)" : "translateY(0)",
            transition: "transform 0.25s ease",
          }}
        >
          {/* <Box
            component={Link}
            to="/"
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.5,
              textDecoration: "none",
              padding: "8px 4px",
            }}
          >
            <HomeIcon sx={{ width: 26, height: 26, color: "#000000" }} />
            <Typography
              sx={{
                fontFamily: "Bricolage Grotesque",
                fontWeight: 600,
                color: "#000000",
                fontSize: "0.7rem",
                textAlign: "center",
              }}
            >
              Home
            </Typography>
          </Box> */}

          {navItems.map((item) => {
            const isBuySell = item.label === "Buy & Sell Car";
            return (
              <Box
                key={item.label}
                component="button"
                type="button"
                onClick={isBuySell ? openBuySell : openLearnDrive}
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 4px",
                  font: "inherit",
                }}
              >
                <Box
                  component="img"
                  src={item.icon}
                  alt=""
                  sx={
                    isBuySell
                      ? { width: 32, height: 32 }
                      : { width: 24, height: 24 }
                  }
                />
                <Typography
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    fontWeight: 600,
                    color: "#000000",
                    fontSize: "0.7rem",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default Navbar2;
