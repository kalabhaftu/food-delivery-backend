const app = require('./api/index');
const port = 3000;

app.listen(port, () => {
    console.log(`Test Server running on port ${port}`);
});
