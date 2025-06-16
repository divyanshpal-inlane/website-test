import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  List,
  ListItem,
  ListItemText,
  Button,
} from "@mui/material";
import {
  Instagram as InstagramIcon,
  X as XIcon,
  LinkedIn as LinkedInIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
} from "@mui/icons-material";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";

const Navbar2 = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpen] = useState(false);

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

      <Box>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          margin="20px"
          mt={6}
        >
          <img
            src="./LANE_LOGO.svg"
            alt="Website Logo"
            style={{ maxWidth: isMobile ? "25%" : "18%", height: "auto" }}
          />
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
          <ListItem button component={Link} to="/about-us" onClick={handleClose}>
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
          <ListItem button component={Link} to="/courses" onClick={handleClose}>
            <ListItemText
              primary={
                <Typography
                  variant="h5"
                  sx={{
                    fontFamily: "Bricolage Grotesque",
                    textAlign: "center",
                  }}
                >
                  Courses
                </Typography>
              }
            />
          </ListItem>
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

          {/* Social Icons */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: 2,
              mt: 8,
              mb: 2,
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
        </List>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" elevation={0}>
        <Toolbar
          sx={{
            backgroundColor: "#Ffff",
            boxShadow: "none",
            padding: theme.spacing(2),
            justifyContent: "space-between",
          }}
        >
          <Box
            sx={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
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
                src="/LANE_LOGO.svg"
                alt="Lane logo"
                width={isMobile ? 50 : 60}
                style={{ marginRight: theme.spacing(1) }}
              />
            </Typography>

            <IconButton
              size="large"
              edge="end"
              arialabel="menu"
              ariacontrols="menu-appbar"
              onClick={toggleDrawer}
              sx={{
                position: "absolute",
                right: 0,
                width: 80,
                height: 73,
                fontWeight: "bold",
              }}
            >
              <img
                src="/PurpleHamburger.png"
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
    </Box>
  );
};

export default Navbar2;
