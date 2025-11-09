export const seoData = {
  '/': {
    title: 'Learn Driving in Just 10 Days | Lane Driving School',    
    description: "Drive confidently with Lane's proven curriculum and expert instructors. Flexible schedules, personalized attention, and excellent results await",
    keywords: 'driving school, learn driving, driving lessons, driving instructor, get license, driving course',
    ogImage: '/LANE_LOGO.svg'
  },
  '/about-us': {
    title: 'About Lane - Empowering Next Generation Drivers | Our Story',
    description: 'Learn about Lane\'s mission to create a world with zero road fatalities. Meet our passionate team revolutionizing driving education with innovative approaches.',
    keywords: 'about lane, driving school team, road safety, driving education, zero road fatalities',
    ogImage: '/LANE_LOGO.svg'
  },
  '/courses': {
    title: 'Driving Courses - Beginner to Advanced | Lane Driving School',
    description: 'Choose from our comprehensive driving courses: Beginner Course (10 hours), Practice Course (8 hours), Mini Courses (3-4 hours). Learn at your own pace.',
    keywords: 'driving courses, beginner driving, practice driving, mini courses, parking course, highway driving',
    ogImage: '/course/letgetyoudriving.svg'
  },
  '/faqs': {
    title: 'Frequently Asked Questions - Lane Driving School',
    description: 'Get answers to common questions about our driving courses, fees, scheduling, safety measures, and more. Everything you need to know about learning with Lane.',
    keywords: 'driving school FAQ, driving lessons questions, course fees, scheduling, safety measures',
    ogImage: '/LANE_LOGO.svg'
  },
  '/blog': {
    title: 'Driving Tips & Road Safety Blog - Lane Driving School',
    description: 'Expert driving tips, road safety advice, and latest updates from Lane. Stay informed about driving techniques, traffic rules, and automotive insights.',
    keywords: 'driving tips, road safety, driving blog, traffic rules, automotive news',
    ogImage: '/LANE_LOGO.svg'
  }
}

export const getLocationSEO = (location) => ({
  title: `Best Driving School in ${location} | Lane Driving Lessons`,
  description: `Learn driving in ${location} with Lane. Professional instructors, flexible schedule, 10-hour comprehensive course. Book your driving lessons in ${location} today!`,
  keywords: `driving school ${location}, driving lessons ${location}, learn driving ${location}, driving instructor ${location}`,
  ogImage: '/LANE_LOGO.svg'
})

export const getBlogSEO = (slug, title, description) => ({
  title: `${title} | Lane Driving Blog`,
  description: description || 'Expert driving tips and road safety advice from Lane Driving School.',
  keywords: 'driving tips, road safety, driving advice, lane blog',
  ogImage: '/LANE_LOGO.svg'
})

export const getDefaultSEO = () => seoData['/']