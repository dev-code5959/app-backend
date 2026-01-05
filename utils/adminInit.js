const User = require('../models/User');
const bcrypt = require('bcryptjs');

const seedAdmin = async () => {
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await User.create({
      email: process.env.ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
      referralCode: 'ADMIN'
    });
    console.log('Default Admin Created');
  }
};
module.exports = seedAdmin;