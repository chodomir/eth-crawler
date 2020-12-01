var express = require('express');
var crawler = require('../source/tx');
var router = express.Router();

// GET transactions
router.get('/', async function(req, res, next) {
    let address = req.query.address.trim().toLowerCase();
    let bStart = Number.parseInt(req.query.bStart);
    let bEnd = Number.parseInt(req.query.bEnd);

    let txList = await crawler.getTxns(address, bStart, bEnd);

    res.render('search', { txList: txList })
});

module.exports = router;