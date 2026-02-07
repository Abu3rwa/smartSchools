# How to Deploy to Heroku

This application is configured to be deployed as a single "Monolith" where the Node.js server serves the React frontend.

## Prerequisites
1.  **Heroku CLI** installed and logged in (`heroku login`).
2.  **Git** installed.

## Deployment Steps

1.  **Navigate to the Server Directory**
    The `server` folder is the root of your deployable application.
    ```bash
    cd a:\business\gb\server
    ```

2.  **Initialize Git (if not done)**
    ```bash
    git init
    # Create a .gitignore if missing, ensuring node_modules is ignored
    echo "node_modules" > .gitignore
    echo ".env" >> .gitignore
    ```

3.  **Commit Your Code**
    ```bash
    git add .
    git commit -m "Initial commit for Heroku deployment"
    ```

4.  **Create Heroku App**
    ```bash
    heroku create gradebook-app-name  # Choose a unique name
    ```

5.  **Set Environment Variables**
    You must configure your production keys on Heroku. Replace values with your actual secrets.
    ```bash
    heroku config:set NODE_ENV=production
    heroku config:set MONGO_URI=your_mongodb_connection_string
    heroku config:set JWT_SECRET=your_jwt_secret
    heroku config:set CLIENT_URL=https://your-app-name.herokuapp.com
    # Add any other env vars from your .env file
    ```

6.  **Deploy**
    ```bash
    git push heroku master
    ```

7.  **Monitor**
    If something goes wrong:
    ```bash
    heroku logs --tail
    ```

## How It Works
*   **`heroku-postbuild`**: This script in `package.json` runs automatically after deployment. It goes into the `client` folder, installs dependencies, and builds the React app.
*   **Static Serving**: The `server.js` file detects `NODE_ENV=production` and serves the `client/dist` folder for any graphical requests.
