---
name: Complaints
meta_title: Social Housing Complaints | Blue Pits Housing Action
meta_description: Make a complaint about social housing services at Blue Pits Housing Action. We follow the Housing Ombudsman's Complaints Handling Code and are committed to putting things right.
permalink: /complaints/
eleventyNavigation:
  key: Complaints
  order: 6
blocks:
  - type: hero
    compact: true
    content: |
      # Social Housing Complaints

      Complaints about social housing services are managed following the [Housing Ombudsman's Complaints Handling Code](https://www.housing-ombudsman.org.uk/landlords-info/complaint-handling-code/)
    buttons:
      - text: Send a complaint online
        href: "#complaints-web-form"
        variant: primary
  - type: markdown
    content: |
      Blue Pits Housing Action (BPHA) aims to deliver a positive tenant experience by providing high quality supported housing and creating communities that are safe and secure and where our tenants are happy to live.

      We are committed to listening to our tenants and dealing with their concerns and complaints, in a fair and impartial way. We are committed to ensuring fair and equal access to the process for all tenants.

      To achieve this, we will:

      - View complaints positively
      - Treat all our tenants fairly
      - Apologise when things go wrong
      - Take prompt action to investigate and then put things right.
      - Learn from the mistakes we make
      - Commit to making improvements.
  - type: downloads
    intro_content: |
      ## Downloads

      If you'd like to make a complaint:
    items:
      - file: /docs/how-to-complain-if-theres-a-problem.pdf
        label: How To Complain If There's A Problem
      - file: /docs/housing-complaints-policy-and-procedure.pdf
        label: Housing Complaints Policy & Procedure
      - file: /docs/housing-complaints-form.pdf
        label: Housing Complaints Form
  - type: downloads
    compact: true
    intro_content: "For regulatory documents about complaints:"
    items:
      - file: /docs/annual-complaints-performance-and-service-improvement-report-oct-25.pdf
        label: "Annual Complaints Performance & Service Improvement Report: Oct 25"
      - file: /docs/governing-body-response-to-annual-report-2024-25.pdf
        label: "Governing Body Response to the Annual Report: 2024/25"
      - file: /docs/self-assessment-form-2025.pdf
        label: Self Assessment Form 2025
  - type: downloads
    compact: true
    intro_content: "For earlier regulatory documents:"
    items:
      - file: /docs/annual-complaints-performance-and-service-improvement-report-jan-25.pdf
        label: "Annual Complaints Performance & Service Improvement Report: Jan 25"
      - file: /docs/annual-complaints-performance-and-service-improvement-report-oct-24.pdf
        label: "Annual Complaints Performance & Service Improvement Report: Oct 24"
      - file: /docs/governing-body-response-to-complaints-q1-2024.pdf
        label: "Governing Body Response to Complaints: Q1 2024"
  - type: contact-form
    content: |
      <h2 id="complaints-web-form">Complaints Web Form</h2>

      **You can send a complaint through the form below.**

      Blue Pits Housing Association is committed to understanding your complaint and putting things right when we have got things wrong.

      If you are not happy with the quality of your housing service, including the timing and standard of repairs carried out in your home, or the contractors who have worked in your home, then please use this form to tell us what went wrong.

      This will help us deal with your complaint quickly and we will do our best to put things right as soon as possible.
    fields:
      - name: name
        label: Your name
        type: text
        required: true
      - name: address
        label: Your address
        type: text
        required: true
      - name: phone
        label: Your phone number
        type: tel
      - name: email
        label: Your email address
        type: email
      - name: complaint
        label: "Your complaint is about:"
        type: textarea
        required: true
        rows: 6
      - name: contact_heading
        label: How should we contact you?
        type: heading
        note: When we receive your complaint, we will let you know in writing within 5 working days and aim to agree on a solution. If we need more information, we will get in touch with you. Please let us know how you prefer to be contacted.
      - name: contact_in_person
        label: In person
        type: checkbox
      - name: contact_by_email
        label: By email
        type: checkbox
      - name: contact_by_phone
        label: By telephone
        type: checkbox
      - name: contact_by_letter
        label: By letter
        type: checkbox
    submit_text: Send Complaint
    redirect: /thank-you/
---
