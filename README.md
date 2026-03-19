# work-search

## Overview

**work-search** is a JavaScript web app designed to streamline and automate job-hunting. It collects, aggregates, and tracks job opportunities from multiple sources, providing filtering, reminders, and a central dashboard for all your applications.

## Features

- **Job Aggregation:** Collects job postings from popular sites and company feeds.
- **Filtering & Search:** Filter jobs by keywords, company, location, salary, or tags.
- **Application Tracker:** Save jobs to your dashboard and mark application status (applied, interview, rejected, etc).
- **Notifications:** Set up browser/email alerts for new matches or deadlines.
- **Custom Sources:** Add or configure new feeds with JSON, RSS, or API support.
- **Export/Import:** Download your tracked jobs as CSV or JSON; migrate your dashboard anywhere.
- **Simple UI:** Clean web interface with sortable tables and powerful search.

## Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/m4x95pt/work-search
   cd work-search
   ```

2. **Open with any browser**
   - Double-click `index.html` _(or run with a local server for best results, e.g. `python -m http.server`)_.
   - No back-end required: all client-side JavaScript.

3. **Configuration**
   - Edit `config.js` or similar to add custom sources, keywords, and notification settings.
   - Example:
     ```js
     export default {
       sources: [
         "https://jobs.github.com/positions.json",
         "https://remoteok.com/api",
         // Add more feeds here
       ],
       keywords: ["python", "remote", "developer", "intern"],
       notificationEmail: "your-email@example.com",
     };
     ```

4. **Usage**
   - Use filters/search to find relevant jobs.
   - Click "Save" to track jobs to your dashboard.
   - Update status and notes as you progress in applications.
   - Export your results for record-keeping.

## Example Workflow

- Open site, enter search keywords.
- Review listings, save interesting jobs.
- Use dashboard to track applications.
- Set reminders for follow-up/interview dates.

## Project Structure

```
work-search/
├── index.html        # Main app interface
├── main.js           # Core app logic
├── config.js         # Data source/keyword config
├── style.css         # Styling
├── assets/           # Icons, images, etc
```

## Customization

- Extend sources in `config.js` for new job boards.
- Adjust filters or dashboard columns in `main.js` for your needs.
- Integrate with external notification services for advanced reminders.

## License

MIT License

**Author:** [@m4x95pt](https://github.com/m4x95pt)
