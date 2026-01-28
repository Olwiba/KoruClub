# koruClub 🤖

A WhatsApp-based accountability club for posting messages, setting goals and much more!

## Features ✨

- **Monday motivation**: Kick off your week with purpose-driven goal setting
- **Friday reflection**: Reflect on your weekly accomplishments
- **Bi-weekly demos**: Share your work in progress on the 1st and 3rd Wednesday of each month
- **Monthly celebration**: Take time to celebrate your achievements at month's end

## Getting started 🚀

### Local Development

1. Clone this repository
2. Install the dependencies with `npm install`
3. Start the bot with `npm start`
4. Scan the QR code with your WhatsApp to authenticate
5. Add the bot to your target group chat

### Deployment on Coolify 🚀

1. Push your code to a Git repository
2. In Coolify, create a new application from your Git repository
3. **Important**: Add a persistent volume mount:
   - Source: `/app/.wwebjs_auth`
   - Destination: Choose a persistent storage location
   - This preserves your WhatsApp session between deployments
4. Deploy the application
5. Check the logs for the QR code on first deployment
6. Scan the QR code with WhatsApp mobile app
7. Add the bot to your target group chat and run `!bot start`

**Note**: The nixpacks.toml file is already configured with all necessary dependencies for Puppeteer/Chrome to run in the container.

## Commands 📝

- `!bot start` - Start the scheduled messaging service
- `!bot status` - Display the current status and upcoming messages
- `!bot help` - Show the available commands

## Additional information ℹ️

- This bot uses WhatsApp Web.js and requires a persistent session
- The bot automatically reconnects if the WhatsApp session drops
- The bot is configured for New Zealand Time (NZT)
- Session data is stored in `.wwebjs_auth/` directory (must be persistent in production)

## Contributing 🤝

This project is closed for contribution, but feel free to fork it and make your own changes!

## Contact 📭

Twitter - [@olwiba](https://twitter.com/olwiba)
