var express = require('express');
var crawler = require('../source/tx');

var router = express.Router();

// GET home page
router.get('/', async function(req, res, next) {
    let address = req.query.address.trim().toLowerCase();
    let token = req.query.token.trim();
    let date = new Date(req.query.date);

    let balance = await crawler.getBalanceOf(address, date, token);
    console.log(balance);

    res.render('balance-detail', { address, token: balance.token, value: balance.value, date: date.toUTCString() });
});

module.exports = router;