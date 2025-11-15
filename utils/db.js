const mongoose = require ('mongoose');
require ('dotenv').config();

const connectToDB = async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URL);
        console.log("Connected to DB");
    }catch(error) {
        console.error(`Database connection failed:${error} `)
    }
};

connectToDB();
module.exports = connectToDB;