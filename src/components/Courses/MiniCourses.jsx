import React, { useState } from 'react';
import styles from '../../css/MiniCourses.module.css'; // Assuming you are using CSS modules
import { Link } from "react-router-dom";

import {
  Box,
  Button,
  Grid,
  Typography,
  List, 
  ListItem,
  ListItemText,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import { CardActionArea } from '@mui/material';
import Rocket from "../../components/SVGs/Rocket";

const CourseCard = ({ title, duration, image, elements, question }) => {

  const [showInfo, setShowInfo] = useState(false);

  const handleCardClick = () => {
    setShowInfo(!showInfo);
  };

  return (
    <Card
      onClick={handleCardClick}
      sx={{
        maxWidth: 345,
        margin: "12px 24px",
        borderRadius: "12px"
      }}>
      {/* <CardActionArea> */}
      <CardMedia
        component="img"
        height="140"
        image={image}
        alt={title}
      />
      <CardContent>
        <Typography
          gutterBottom variant="h5"
          component="div"
          sx={{
            fontSize: "18px",
            fontWeight: "bold"
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: "16px",
            // fontWeight: "bold"
          }}
        >
          Duration: {duration} hours
        </Typography>
        <Typography
          variant="body3"
          color="text.secondary"
          sx={{
            fontSize: "14px",
            // fontWeight: "bold"
          }}
        >
          {/*Price: Rs. {duration * 1000}/-*/}
        </Typography>
        {showInfo && (
          <>
            <div
              style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                backgroundColor: '#f9f9f9',
                marginTop: '10px'
              }}
            >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: "14px",
                marginTop: "10px"
              }}
            >
              {question}
            </Typography>
            <List sx={{ listStyleType: 'disc', paddingLeft: '20px' }}>
                {elements.map((element, index) => (
                  <ListItem key={index} sx={{ display: 'list-item' }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" color="text.secondary">
                          {element}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </div>
          </>
        )}
      </CardContent>
      {/* </CardActionArea> */}
    </Card>
  );
};

const MiniCourses = () => {
  const courses = [
    {
      title: "Mini Course 1 - City driving",
      duration: 4,
      imgsrc: "/city-driving.jpg",
      alt: "City Driving Mini Course",
      question: 'What will we ace together?',
      elements: [
        'Bumper to bumper traffic', 
        'Navigating flyovers, intersections, and roundabouts', 
        'Maintaining and changing lanes',
        'Evening driving'
      ],
    },
    {
      title: "Mini Course 2 - Parking",
      duration: 2,
      imgsrc: "/parking-mini-course.png",
      alt: "Parking Mini Course",
      question: 'What will we ace together?',
      elements: [
        'Entry/Exit parking spots',
        'Parallel parking',
        'Perpendicular parking',
        'On-road parking'
      ],
    },
    {
      title: "Mini Course 3 - Highway driving",
      duration: 2,
      imgsrc: "/highway-driving-course.png",
      alt: "Highway Driving Mini Course",
      question: 'What will we ace together?',
      elements: [
        'Highway entry/exit with maintaining speed limit',
        'Pitstops for tire pressure and gas check',
        'Maneuvers - Changing lanes and U-turns',
        'How to pass other cars safely'
      ],
    },
  ];

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const isMediumScreen = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const smallIconStyle = { color: "white", width: 20, height: 20 };
  const mediumIconStyle = { color: "white", width: 34, height: 34 };
  const largeIconStyle = { color: "white", width: 44, height: 44 };
  const IconStyle = isSmallScreen
    ? smallIconStyle
    : isMediumScreen
      ? mediumIconStyle
      : largeIconStyle;

  return (
    <section className={styles.miniCoursesDetails} style={{ "paddingTop": "54px", "paddingBottom": "108px" }}>

      <div className={styles.courseHeader}>
        <Box
          sx={{
            backgroundImage: "url('/Tag5.svg')",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            backgroundPosition: "center",
            width: { xs: "100%", sm: "100%", md: "75%", lg: "50%" },
            margin: "0 auto", // Center horizontally
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Typography
            variant="h5"
            fontWeight="bold"
            fontFamily="Bricolage Grotesque"
            color="#000000"
          >
            Mini Courses
          </Typography>
        </Box>
        <p className={styles.sectionSubtitle}>
          Upgrade your skills - because even pros need a tune-up!
        </p>
        <p className={styles.sectionSubtagline}>
          (You can also mix and match to create your own customized practice course)
        </p>
      </div>
      <div className={styles.coursesList}>
        {courses.map((course, index) => (
          <CourseCard
            key={index}
            title={course.title}
            duration={course.duration}
            image={course.imgsrc}
            question={course.question}
            elements={course.elements} />
        ))}
      </div>
      <div className={styles.miniCoursesSecondDiv}>
        <Button
          variant="contained"
          component={Link}
          to={"/signup"}
          size="large"
          startIcon={<Rocket color={IconStyle} />}
          sx={{
            scale: { xs: "1", sm: "1", md: "0.65", lg: "0.65" },
            backgroundColor: "#00CE84",
            color: "white",
            "&:hover": {
              backgroundColor: "#00CE85",
            },
            border: "3px solid white",
            borderRadius: "50px",
            boxShadow: "2px 4px 4px rgba(0, 0, 0, 0.35)",
            padding: { xs: "12px 24px", sm: "14px 32px", md: "16px 44px" },
            // width: { xs: "75%", sm: "70%", md: "60%", lg: 324.38 },
            maxWidth: 324.38,
            height: { xs: 38, sm: 60, md: 69.47 },
            fontFamily: "Bricolage Grotesque",
            fontSize: { xs: "16px", sm: "24px", md: "24px", lg: "24px" },
            fontWeight: "bold",
            textTransform: "none",
            marginTop: { xs: "12px", sm: "30px", md: "40px" },
          }}
        >
          Sign Up Now
        </Button>
      </div>
    </section>
  );
};

export default MiniCourses;
